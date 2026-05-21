import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { HutbStatusBar } from './statusBar';
import {
    ParsedArguments,
    findApiCalls,
    parseArguments,
    parseLiteralValue,
    readNumericArgument
} from '../utils/pythonCallParser';

export interface HotReloadUpdate {
    functionName: string;
    topic: string;
    line: number;
    payload: Record<string, unknown>;
}

interface ValidationResult {
    valid: boolean;
    reason?: string;
}

export class HutbHotReloadManager implements vscode.Disposable {
    private readonly statusBar: HutbStatusBar;
    private disposed = false;

    constructor(statusBar: HutbStatusBar) {
        this.statusBar = statusBar;
    }

    public async handleSavedDocument(document: vscode.TextDocument) {
        if (document.languageId !== 'python' || this.disposed) {
            return;
        }

        const config = vscode.workspace.getConfiguration('hutb.hotReload');
        if (!config.get<boolean>('enabled', true)) {
            return;
        }

        const updates = HutbHotReloadManager.extractUpdates(document.getText());
        if (updates.length === 0) {
            return;
        }

        const invalid = updates
            .map(update => ({ update, result: HutbHotReloadManager.validateUpdate(update) }))
            .find(item => !item.result.valid);

        if (invalid) {
            const reason = invalid.result.reason ?? '参数不符合热重载要求';
            this.statusBar.showHotReloadResult(false, `热重载失败：第 ${invalid.update.line + 1} 行 ${reason}`);
            vscode.window.showWarningMessage(`HUTB 热重载失败：${reason}`);
            return;
        }

        try {
            for (const update of updates) {
                await this.sendUpdate(update);
            }
            const message = `已通过 MCP 增量更新 ${updates.length} 个仿真参数`;
            this.statusBar.showHotReloadResult(true, message);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.statusBar.showHotReloadResult(false, `热重载失败：${reason}`);
            vscode.window.showWarningMessage(`HUTB 热重载失败：${reason}`);
        }
    }

    public dispose() {
        this.disposed = true;
    }

    public static extractUpdates(text: string): HotReloadUpdate[] {
        const updates: HotReloadUpdate[] = [];
        for (const call of findApiCalls(text)) {
            if (call.moduleName !== 'hutb' || !this.isHotReloadableFunction(call.funcName)) {
                continue;
            }

            const parsed = parseArguments(call.argsText);
            updates.push({
                functionName: call.fullName,
                topic: this.topicForFunction(call.funcName),
                line: call.line,
                payload: this.payloadForFunction(call.funcName, parsed)
            });
        }

        return updates;
    }

    public static validateUpdate(update: HotReloadUpdate): ValidationResult {
        const speed = this.readPayloadNumber(update.payload, ['speed', 'speed_kmh', 'target_speed']);
        if (speed !== undefined && (speed < 0 || speed > 250)) {
            return { valid: false, reason: `车辆目标速度 ${speed}km/h 超出 [0, 250]` };
        }

        const sampleRate = this.readPayloadNumber(update.payload, ['sample_rate', 'rate', 'frequency', 'fps']);
        if (sampleRate !== undefined && (sampleRate < 1 || sampleRate > 240)) {
            return { valid: false, reason: `传感器采样率 ${sampleRate}Hz 超出 [1, 240]` };
        }

        const fov = this.readPayloadNumber(update.payload, ['fov', 'angle', 'horizontal_fov']);
        if (fov !== undefined && (fov < 1 || fov > 180)) {
            return { valid: false, reason: `传感器视场角 ${fov}° 超出 [1, 180]` };
        }

        const intensity = this.readPayloadNumber(update.payload, ['intensity']);
        if (intensity !== undefined && (intensity < 0 || intensity > 1)) {
            return { valid: false, reason: `环境强度 ${intensity} 超出 [0, 1]` };
        }

        const steering = this.readPayloadNumber(update.payload, ['steer']);
        if (steering !== undefined && (steering < -1 || steering > 1)) {
            return { valid: false, reason: `方向盘转角 ${steering} 超出 [-1, 1]` };
        }

        return { valid: true };
    }

    private static isHotReloadableFunction(funcName: string): boolean {
        return [
            'set_vehicle_speed',
            'update_sensor_params',
            'set_weather',
            'set_vehicle_control',
            'update_scene_lighting'
        ].includes(funcName);
    }

    private static topicForFunction(funcName: string): string {
        switch (funcName) {
            case 'set_vehicle_speed':
            case 'set_vehicle_control':
                return 'vehicle/control/hot_reload';
            case 'update_sensor_params':
                return 'sensor/params/hot_reload';
            case 'set_weather':
            case 'update_scene_lighting':
                return 'scene/environment/hot_reload';
            default:
                return 'simulation/hot_reload';
        }
    }

    private static payloadForFunction(funcName: string, parsed: ParsedArguments): Record<string, unknown> {
        const payload = this.argumentsToPayload(parsed);

        if (funcName === 'set_vehicle_speed') {
            payload.speed = readNumericArgument(parsed, 1, ['speed', 'speed_kmh', 'target_speed']);
        }

        if (funcName === 'update_sensor_params') {
            payload.sample_rate = readNumericArgument(parsed, 1, ['sample_rate', 'rate', 'frequency', 'fps']);
            payload.fov = readNumericArgument(parsed, 2, ['fov', 'angle', 'horizontal_fov']);
        }

        return Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined)
        );
    }

    private static argumentsToPayload(parsed: ParsedArguments): Record<string, unknown> {
        const payload: Record<string, unknown> = {};
        parsed.positional.forEach((arg, index) => {
            payload[`arg${index}`] = parseLiteralValue(arg);
        });

        for (const [name, value] of parsed.named) {
            payload[name] = parseLiteralValue(value);
        }

        return payload;
    }

    private static readPayloadNumber(payload: Record<string, unknown>, names: string[]): number | undefined {
        for (const name of names) {
            const value = payload[name];
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
        }
        return undefined;
    }

    private async sendUpdate(update: HotReloadUpdate): Promise<void> {
        const config = vscode.workspace.getConfiguration('hutb.hotReload');
        const endpoint = config.get<string>('mcpEndpoint', 'http://127.0.0.1:9000/hutb/hot-reload');
        const timeoutMs = config.get<number>('timeoutMs', 1500);

        await postJson(endpoint, {
            protocol: 'MCP',
            command: 'hot_reload',
            topic: update.topic,
            function: update.functionName,
            line: update.line + 1,
            payload: update.payload,
            timestamp: new Date().toISOString()
        }, timeoutMs);
    }
}

function postJson(endpoint: string, payload: unknown, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
        let url: URL;
        try {
            url = new URL(endpoint);
        } catch {
            reject(new Error(`MCP 热重载地址无效: ${endpoint}`));
            return;
        }

        const body = JSON.stringify(payload);
        const transport = url.protocol === 'https:' ? https : http;
        const request = transport.request(
            {
                method: 'POST',
                hostname: url.hostname,
                port: url.port,
                path: `${url.pathname}${url.search}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            },
            response => {
                const chunks: Buffer[] = [];
                response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                response.on('end', () => {
                    const responseBody = Buffer.concat(chunks).toString('utf8');
                    const statusCode = response.statusCode ?? 0;
                    if (statusCode >= 200 && statusCode < 300) {
                        resolve();
                        return;
                    }
                    reject(new Error(`MCP 返回 ${statusCode}${responseBody ? `: ${responseBody}` : ''}`));
                });
            }
        );

        request.on('error', reject);
        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`MCP 连接超时 (${timeoutMs}ms)`));
        });
        request.write(body);
        request.end();
    });
}
