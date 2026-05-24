import * as vscode from 'vscode';
import {
    PythonCall,
    findApiCalls,
    parseArguments,
    parseLiteralValue
} from '../utils/pythonCallParser';

export interface PreviewPoint {
    x: number;
    y: number;
    z: number;
}

export interface PreviewVehicle {
    id: string;
    type: string;
    color: string;
    position: PreviewPoint;
    line: number;
}

export interface PreviewSensor {
    id: string;
    type: string;
    vehicleId: string;
    position: PreviewPoint;
    line: number;
}

export interface PreviewObstacle {
    id: string;
    type: string;
    position: PreviewPoint;
    target?: PreviewPoint;
    line: number;
}

export interface ScenePreviewModel {
    scriptName?: string;
    scenePath?: string;
    vehicles: PreviewVehicle[];
    sensors: PreviewSensor[];
    obstacles: PreviewObstacle[];
    warnings: string[];
    updatedAt: string;
}

const DEFAULT_POINT: PreviewPoint = { x: 0, y: 0, z: 0 };

export function parsePointLiteral(raw: string | undefined): PreviewPoint | undefined {
    if (!raw) {
        return undefined;
    }

    const value = raw.trim();
    const match = /^[[(]\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+)))?\s*[\])]$/.exec(value);
    if (!match) {
        return undefined;
    }

    return {
        x: Number(match[1]),
        y: Number(match[2]),
        z: match[3] === undefined ? 0 : Number(match[3])
    };
}

export function extractScenePreviewModel(text: string, scriptName?: string): ScenePreviewModel {
    const model: ScenePreviewModel = {
        scriptName,
        vehicles: [],
        sensors: [],
        obstacles: [],
        warnings: [],
        updatedAt: new Date().toISOString()
    };
    const vehiclesById = new Map<string, PreviewVehicle>();

    for (const call of findApiCalls(text)) {
        if (call.moduleName !== 'hutb') {
            continue;
        }

        const parsed = parseArguments(call.argsText);
        switch (call.funcName) {
            case 'load_scene':
                model.scenePath = readStringArg(parsed.positional[0] ?? parsed.named.get('scene_path'));
                break;
            case 'create_vehicle': {
                const id = call.assignedTo ?? `vehicle_${model.vehicles.length + 1}`;
                const vehicle: PreviewVehicle = {
                    id,
                    type: readStringArg(parsed.positional[0] ?? parsed.named.get('vehicle_type')) ?? 'vehicle',
                    color: readStringArg(parsed.named.get('color') ?? parsed.positional[3]) ?? 'white',
                    position: parsePointLiteral(parsed.named.get('position') ?? parsed.positional[1]) ?? DEFAULT_POINT,
                    line: call.line + 1
                };
                model.vehicles.push(vehicle);
                vehiclesById.set(id, vehicle);
                break;
            }
            case 'add_sensor': {
                const id = call.assignedTo ?? `sensor_${model.sensors.length + 1}`;
                const vehicleId = readIdentifier(parsed.named.get('vehicle') ?? parsed.named.get('target_vehicle') ?? parsed.positional[0]) ?? 'unknown_vehicle';
                if (!vehiclesById.has(vehicleId)) {
                    model.warnings.push(`第 ${call.line + 1} 行传感器 ${id} 引用了未在脚本中创建的车辆 ${vehicleId}`);
                }
                model.sensors.push({
                    id,
                    type: readStringArg(parsed.positional[1] ?? parsed.named.get('sensor_type')) ?? 'sensor',
                    vehicleId,
                    position: parsePointLiteral(parsed.named.get('position') ?? parsed.positional[2]) ?? DEFAULT_POINT,
                    line: call.line + 1
                });
                break;
            }
            case 'add_pedestrian':
                model.obstacles.push({
                    id: call.assignedTo ?? `pedestrian_${model.obstacles.length + 1}`,
                    type: 'pedestrian',
                    position: parsePointLiteral(parsed.named.get('position') ?? parsed.positional[0]) ?? DEFAULT_POINT,
                    target: parsePointLiteral(parsed.named.get('target') ?? parsed.positional[1]),
                    line: call.line + 1
                });
                break;
            case 'add_obstacle':
            case 'create_obstacle':
                model.obstacles.push(readObstacle(call, model.obstacles.length + 1));
                break;
        }
    }

    return model;
}

function readObstacle(call: PythonCall, index: number): PreviewObstacle {
    const parsed = parseArguments(call.argsText);
    return {
        id: call.assignedTo ?? `obstacle_${index}`,
        type: readStringArg(parsed.named.get('type') ?? parsed.named.get('obstacle_type') ?? parsed.positional[0]) ?? 'obstacle',
        position: parsePointLiteral(parsed.named.get('position') ?? parsed.positional[1] ?? parsed.positional[0]) ?? DEFAULT_POINT,
        line: call.line + 1
    };
}

function readStringArg(raw: string | undefined): string | undefined {
    const value = parseLiteralValue(raw);
    return typeof value === 'string' ? value : undefined;
}

function readIdentifier(raw: string | undefined): string | undefined {
    const value = raw?.trim();
    return value && /^[A-Za-z_]\w*$/.test(value) ? value : undefined;
}

export class HutbScenePreviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'hutb.scenePreview';
    private view?: vscode.WebviewView;
    private latestModel: ScenePreviewModel = extractScenePreviewModel('', '');
    private disposed = false;

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(message => {
            if (message.command === 'refresh') {
                this.refresh();
            }
        });
        this.postModel();
    }

    public refresh(document = vscode.window.activeTextEditor?.document) {
        if (this.disposed) {
            return;
        }

        if (!document || document.languageId !== 'python') {
            this.latestModel = extractScenePreviewModel('', '');
        } else {
            this.latestModel = extractScenePreviewModel(document.getText(), document.uri.fsPath);
        }
        this.postModel();
    }

    public dispose() {
        this.disposed = true;
    }

    private postModel() {
        this.view?.webview.postMessage({
            command: 'scenePreview',
            model: this.latestModel
        });
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HUTB 场景预览</title>
    <style>
        body { margin: 0; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); }
        .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
        button { border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-button-foreground); background: var(--vscode-button-background); padding: 4px 8px; border-radius: 4px; cursor: pointer; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        .status { flex: 1; min-width: 0; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .canvas { height: 280px; border: 1px solid var(--vscode-sideBarSectionHeader-border); border-radius: 6px; background: var(--vscode-editor-background); overflow: hidden; }
        svg { width: 100%; height: 100%; display: block; }
        .legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 10px 0; color: var(--vscode-descriptionForeground); font-size: 12px; }
        .legend span::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
        .vehicle::before { background: #2f80ed; }
        .sensor::before { background: #27ae60; }
        .obstacle::before { background: #eb5757; }
        .target::before { background: #f2c94c; }
        .list { display: grid; gap: 6px; margin-top: 10px; }
        .item { border: 1px solid var(--vscode-sideBarSectionHeader-border); border-radius: 6px; padding: 7px 8px; background: var(--vscode-editor-background); }
        .item strong { display: block; font-size: 12px; }
        .item small { color: var(--vscode-descriptionForeground); }
        .empty { padding: 24px 8px; text-align: center; color: var(--vscode-descriptionForeground); }
        .warn { color: var(--vscode-editorWarning-foreground); font-size: 12px; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="refresh" title="刷新当前脚本场景预览">刷新</button>
        <div class="status" id="status">等待 Python 仿真脚本</div>
    </div>
    <div class="canvas" id="canvas"><div class="empty">打开 HUTB Python 脚本后显示二维布局</div></div>
    <div class="legend">
        <span class="vehicle">车辆</span>
        <span class="sensor">传感器</span>
        <span class="obstacle">障碍物/行人</span>
        <span class="target">目标点</span>
    </div>
    <div class="list" id="list"></div>
    <div id="warnings"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command !== 'scenePreview') { return; }
            render(message.model);
        });

        function render(model) {
            const vehicles = model.vehicles || [];
            const sensors = model.sensors || [];
            const obstacles = model.obstacles || [];
            const allPoints = [
                ...vehicles.map(item => item.position),
                ...obstacles.map(item => item.position),
                ...obstacles.map(item => item.target).filter(Boolean)
            ];
            document.getElementById('status').textContent = model.scenePath || model.scriptName || '未识别到场景文件';
            if (allPoints.length === 0) {
                document.getElementById('canvas').innerHTML = '<div class="empty">未识别到车辆、传感器或障碍物坐标</div>';
                document.getElementById('list').innerHTML = '';
                document.getElementById('warnings').innerHTML = '';
                return;
            }

            const bounds = makeBounds(allPoints);
            const sensorByVehicle = new Map();
            sensors.forEach(sensor => {
                if (!sensorByVehicle.has(sensor.vehicleId)) { sensorByVehicle.set(sensor.vehicleId, []); }
                sensorByVehicle.get(sensor.vehicleId).push(sensor);
            });

            const vehicleSvg = vehicles.map(vehicle => {
                const p = project(vehicle.position, bounds);
                const sensorSvg = (sensorByVehicle.get(vehicle.id) || []).map(sensor => {
                    const sp = project({ x: vehicle.position.x + sensor.position.x, y: vehicle.position.y + sensor.position.y, z: 0 }, bounds);
                    return '<circle cx="' + sp.x + '" cy="' + sp.y + '" r="4" fill="#27ae60"><title>' + escapeHtml(sensor.id + ' / ' + sensor.type) + '</title></circle>';
                }).join('');
                return '<g><rect x="' + (p.x - 11) + '" y="' + (p.y - 7) + '" width="22" height="14" rx="3" fill="#2f80ed"><title>' + escapeHtml(vehicle.id + ' / ' + vehicle.type) + '</title></rect><text x="' + (p.x + 14) + '" y="' + (p.y + 4) + '" fill="var(--vscode-foreground)" font-size="10">' + escapeHtml(vehicle.id) + '</text>' + sensorSvg + '</g>';
            }).join('');

            const obstacleSvg = obstacles.map(obstacle => {
                const p = project(obstacle.position, bounds);
                const target = obstacle.target ? project(obstacle.target, bounds) : undefined;
                const line = target ? '<line x1="' + p.x + '" y1="' + p.y + '" x2="' + target.x + '" y2="' + target.y + '" stroke="#f2c94c" stroke-dasharray="4 3" />' : '';
                const targetSvg = target ? '<circle cx="' + target.x + '" cy="' + target.y + '" r="4" fill="#f2c94c" />' : '';
                return '<g>' + line + '<circle cx="' + p.x + '" cy="' + p.y + '" r="7" fill="#eb5757"><title>' + escapeHtml(obstacle.id + ' / ' + obstacle.type) + '</title></circle>' + targetSvg + '</g>';
            }).join('');

            document.getElementById('canvas').innerHTML = '<svg viewBox="0 0 320 240" role="img" aria-label="HUTB 场景二维布局"><rect x="0" y="0" width="320" height="240" fill="transparent" />' + gridSvg() + obstacleSvg + vehicleSvg + '</svg>';
            document.getElementById('list').innerHTML = [
                ...vehicles.map(item => '<div class="item"><strong>' + escapeHtml(item.id) + '</strong><small>' + escapeHtml(item.type) + ' · (' + item.position.x + ', ' + item.position.y + ')</small></div>'),
                ...sensors.map(item => '<div class="item"><strong>' + escapeHtml(item.id) + '</strong><small>' + escapeHtml(item.type) + ' · ' + escapeHtml(item.vehicleId) + '</small></div>'),
                ...obstacles.map(item => '<div class="item"><strong>' + escapeHtml(item.id) + '</strong><small>' + escapeHtml(item.type) + ' · (' + item.position.x + ', ' + item.position.y + ')</small></div>')
            ].join('');
            document.getElementById('warnings').innerHTML = (model.warnings || []).map(item => '<div class="warn">' + escapeHtml(item) + '</div>').join('');
        }

        function makeBounds(points) {
            const xs = points.map(point => point.x);
            const ys = points.map(point => point.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const padX = Math.max(12, (maxX - minX) * 0.2);
            const padY = Math.max(12, (maxY - minY) * 0.2);
            return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
        }

        function project(point, bounds) {
            const width = Math.max(1, bounds.maxX - bounds.minX);
            const height = Math.max(1, bounds.maxY - bounds.minY);
            return {
                x: 24 + ((point.x - bounds.minX) / width) * 272,
                y: 216 - ((point.y - bounds.minY) / height) * 192
            };
        }

        function gridSvg() {
            let html = '';
            for (let x = 24; x <= 296; x += 34) { html += '<line x1="' + x + '" y1="24" x2="' + x + '" y2="216" stroke="var(--vscode-sideBarSectionHeader-border)" opacity="0.45" />'; }
            for (let y = 24; y <= 216; y += 32) { html += '<line x1="24" y1="' + y + '" x2="296" y2="' + y + '" stroke="var(--vscode-sideBarSectionHeader-border)" opacity="0.45" />'; }
            return html;
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
