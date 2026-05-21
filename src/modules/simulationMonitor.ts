import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

export interface TelemetrySample {
    timestamp: string;
    vehicleId: string;
    x: number;
    y: number;
    speed: number;
    acceleration: number;
    steering: number;
    cameraFrames: number;
    lidarPoints: number;
    source: 'hutb' | 'mock';
}

export class HutbSimulationMonitorProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'hutb.simulationMonitor';
    private readonly context: vscode.ExtensionContext;
    private view?: vscode.WebviewView;
    private timer?: NodeJS.Timeout;
    private samples: TelemetrySample[] = [];
    private mockStep = 0;
    private disposed = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;
        const echartsUri = webviewView.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'node_modules', 'echarts', 'dist', 'echarts.min.js'))
        );

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'node_modules', 'echarts', 'dist'))
            ]
        };
        webviewView.webview.html = this.getHtml(webviewView.webview, echartsUri);
        webviewView.webview.onDidReceiveMessage(async message => {
            if (message.command === 'exportCsv') {
                await this.exportCsv();
            }
            if (message.command === 'refresh') {
                await this.pollOnce();
            }
        });

        this.start();
    }

    public start() {
        if (this.timer || this.disposed) {
            return;
        }

        const intervalMs = vscode.workspace.getConfiguration('hutb.monitor').get<number>('pollIntervalMs', 1000);
        this.timer = setInterval(() => void this.pollOnce(), Math.max(300, intervalMs));
        void this.pollOnce();
    }

    public stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    public async exportCsv() {
        if (this.samples.length === 0) {
            vscode.window.showWarningMessage('暂无仿真监控数据可导出。');
            return;
        }

        const defaultUri = this.defaultCsvUri();
        const uri = await vscode.window.showSaveDialog({
            defaultUri,
            filters: { CSV: ['csv'] },
            saveLabel: '导出仿真数据'
        });

        if (!uri) {
            return;
        }

        await fs.promises.writeFile(uri.fsPath, HutbSimulationMonitorProvider.toCsv(this.samples), 'utf8');
        vscode.window.showInformationMessage(`仿真数据已导出：${uri.fsPath}`);
    }

    public dispose() {
        this.disposed = true;
        this.stop();
    }

    public static normalizeTelemetry(raw: unknown): TelemetrySample {
        const data = isRecord(raw) ? raw : {};
        const position = isRecord(data.position) ? data.position : data;
        const sensors = isRecord(data.sensors) ? data.sensors : {};
        const camera = isRecord(sensors.camera) ? sensors.camera : {};
        const lidar = isRecord(sensors.lidar) ? sensors.lidar : {};

        return {
            timestamp: String(data.timestamp ?? new Date().toISOString()),
            vehicleId: String(data.vehicleId ?? data.vehicle_id ?? 'ego'),
            x: toNumber(position.x, 0),
            y: toNumber(position.y, 0),
            speed: toNumber(data.speed ?? data.velocity ?? data.speedKmh, 0),
            acceleration: toNumber(data.acceleration ?? data.accel, 0),
            steering: toNumber(data.steering ?? data.steer, 0),
            cameraFrames: toNumber(camera.frames ?? data.cameraFrames, 0),
            lidarPoints: toNumber(lidar.points ?? data.lidarPoints, 0),
            source: 'hutb'
        };
    }

    public static toCsv(samples: TelemetrySample[]): string {
        const header = [
            'timestamp',
            'vehicle_id',
            'x',
            'y',
            'speed_kmh',
            'acceleration',
            'steering',
            'camera_frames',
            'lidar_points',
            'source'
        ];
        const rows = samples.map(sample => [
            sample.timestamp,
            sample.vehicleId,
            sample.x,
            sample.y,
            sample.speed,
            sample.acceleration,
            sample.steering,
            sample.cameraFrames,
            sample.lidarPoints,
            sample.source
        ].map(escapeCsv).join(','));

        return [header.join(','), ...rows].join('\n');
    }

    private async pollOnce() {
        const config = vscode.workspace.getConfiguration('hutb.monitor');
        const endpoint = config.get<string>('telemetryEndpoint', '');
        const keepSamples = config.get<number>('historySize', 120);
        const allowMock = config.get<boolean>('useMockWhenDisconnected', true);

        let sample: TelemetrySample;
        try {
            sample = endpoint
                ? HutbSimulationMonitorProvider.normalizeTelemetry(await getJson(endpoint, 1200))
                : this.createMockSample();
        } catch (error) {
            if (!allowMock) {
                this.postState('error', error instanceof Error ? error.message : String(error));
                return;
            }
            sample = this.createMockSample();
        }

        this.samples.push(sample);
        this.samples = this.samples.slice(-Math.max(10, keepSamples));
        this.postState('ok');
    }

    private postState(status: 'ok' | 'error', message = '') {
        this.view?.webview.postMessage({
            command: 'telemetry',
            status,
            message,
            samples: this.samples
        });
    }

    private createMockSample(): TelemetrySample {
        this.mockStep++;
        const t = this.mockStep;
        return {
            timestamp: new Date().toISOString(),
            vehicleId: 'ego',
            x: Number((t * 1.8).toFixed(2)),
            y: Number((Math.sin(t / 8) * 18).toFixed(2)),
            speed: Number((42 + Math.sin(t / 5) * 8).toFixed(2)),
            acceleration: Number((Math.cos(t / 4) * 1.8).toFixed(2)),
            steering: Number((Math.sin(t / 10) * 0.35).toFixed(3)),
            cameraFrames: t * 2,
            lidarPoints: 18000 + Math.round(Math.sin(t / 4) * 2500),
            source: 'mock'
        };
    }

    private defaultCsvUri(): vscode.Uri {
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? this.context.extensionPath;
        const fileName = `hutb-telemetry-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        return vscode.Uri.file(path.join(folder, fileName));
    }

    private getHtml(webview: vscode.Webview, echartsUri: vscode.Uri): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HUTB 仿真监控</title>
    <style>
        body { margin: 0; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); }
        .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
        button { border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-button-foreground); background: var(--vscode-button-background); padding: 4px 8px; border-radius: 4px; cursor: pointer; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        .status { flex: 1; min-width: 0; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
        .metric { border: 1px solid var(--vscode-sideBarSectionHeader-border); padding: 8px; border-radius: 6px; background: var(--vscode-editor-background); }
        .metric-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
        .metric-value { margin-top: 3px; font-size: 18px; font-weight: 700; }
        .chart { height: 156px; margin: 10px 0; border: 1px solid var(--vscode-sideBarSectionHeader-border); border-radius: 6px; background: var(--vscode-editor-background); }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="refresh" title="立即刷新">刷新</button>
        <button id="export" title="导出 CSV">CSV</button>
        <div class="status" id="status">等待仿真数据</div>
    </div>
    <div class="metric-grid">
        <div class="metric"><div class="metric-label">车速 km/h</div><div class="metric-value" id="speed">--</div></div>
        <div class="metric"><div class="metric-label">加速度 m/s²</div><div class="metric-value" id="accel">--</div></div>
        <div class="metric"><div class="metric-label">方向盘</div><div class="metric-value" id="steer">--</div></div>
        <div class="metric"><div class="metric-label">雷达点数</div><div class="metric-value" id="lidar">--</div></div>
    </div>
    <div id="speedChart" class="chart"></div>
    <div id="gaugeChart" class="chart"></div>
    <div id="mapChart" class="chart"></div>
    <script nonce="${nonce}" src="${echartsUri}"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const charts = {
            speed: echarts.init(document.getElementById('speedChart')),
            gauge: echarts.init(document.getElementById('gaugeChart')),
            map: echarts.init(document.getElementById('mapChart'))
        };

        document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
        document.getElementById('export').addEventListener('click', () => vscode.postMessage({ command: 'exportCsv' }));
        window.addEventListener('resize', () => Object.values(charts).forEach(chart => chart.resize()));

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command !== 'telemetry') { return; }
            const samples = message.samples || [];
            const latest = samples[samples.length - 1];
            document.getElementById('status').textContent = message.status === 'ok'
                ? (latest?.source === 'mock' ? '演示数据，等待 HUTB 接口' : 'HUTB 实时数据已连接')
                : message.message;
            if (!latest) { return; }
            document.getElementById('speed').textContent = latest.speed.toFixed(1);
            document.getElementById('accel').textContent = latest.acceleration.toFixed(2);
            document.getElementById('steer').textContent = latest.steering.toFixed(2);
            document.getElementById('lidar').textContent = String(latest.lidarPoints);
            renderCharts(samples);
        });

        function renderCharts(samples) {
            const labels = samples.map((_, index) => index + 1);
            const latest = samples[samples.length - 1];
            charts.speed.setOption({
                animation: false,
                grid: { left: 36, right: 12, top: 24, bottom: 28 },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: labels, axisLabel: { color: '#999' } },
                yAxis: { type: 'value', name: 'km/h', axisLabel: { color: '#999' } },
                series: [{ type: 'line', name: '速度', data: samples.map(s => s.speed), smooth: true, symbol: 'none', lineStyle: { width: 2, color: '#4FC3F7' }, areaStyle: { opacity: 0.12, color: '#4FC3F7' } }]
            });
            charts.gauge.setOption({
                animation: false,
                series: [{ type: 'gauge', min: 0, max: 160, progress: { show: true, width: 8 }, axisLine: { lineStyle: { width: 8 } }, detail: { formatter: '{value} km/h', fontSize: 14 }, data: [{ value: Number(latest.speed.toFixed(1)) }] }]
            });
            charts.map.setOption({
                animation: false,
                grid: { left: 36, right: 12, top: 20, bottom: 28 },
                tooltip: { trigger: 'item' },
                xAxis: { type: 'value', name: 'x', axisLabel: { color: '#999' } },
                yAxis: { type: 'value', name: 'y', axisLabel: { color: '#999' } },
                series: [{ type: 'line', name: '车辆轨迹', data: samples.map(s => [s.x, s.y]), symbolSize: 4, lineStyle: { width: 2, color: '#A5D6A7' }, itemStyle: { color: '#A5D6A7' } }]
            });
        }
    </script>
</body>
</html>`;
    }
}

function getJson(endpoint: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let url: URL;
        try {
            url = new URL(endpoint);
        } catch {
            reject(new Error(`仿真数据接口地址无效: ${endpoint}`));
            return;
        }

        const transport = url.protocol === 'https:' ? https : http;
        const request = transport.get(url, response => {
            const chunks: Buffer[] = [];
            response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            response.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
                    reject(new Error(`仿真数据接口返回 ${response.statusCode}`));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch {
                    reject(new Error('仿真数据接口返回的不是 JSON'));
                }
            });
        });

        request.on('error', reject);
        request.setTimeout(timeoutMs, () => request.destroy(new Error(`仿真数据接口超时 (${timeoutMs}ms)`)));
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }
    return fallback;
}

function escapeCsv(value: unknown): string {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function getNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
