"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HutbHotReloadManager = void 0;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const pythonCallParser_1 = require("../utils/pythonCallParser");
class HutbHotReloadManager {
    constructor(statusBar) {
        this.disposed = false;
        this.statusBar = statusBar;
    }
    async handleSavedDocument(document) {
        if (document.languageId !== 'python' || this.disposed) {
            return;
        }
        const config = vscode.workspace.getConfiguration('hutb.hotReload');
        if (!config.get('enabled', true)) {
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
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.statusBar.showHotReloadResult(false, `热重载失败：${reason}`);
            vscode.window.showWarningMessage(`HUTB 热重载失败：${reason}`);
        }
    }
    dispose() {
        this.disposed = true;
    }
    static extractUpdates(text) {
        const updates = [];
        for (const call of (0, pythonCallParser_1.findApiCalls)(text)) {
            if (call.moduleName !== 'hutb' || !this.isHotReloadableFunction(call.funcName)) {
                continue;
            }
            const parsed = (0, pythonCallParser_1.parseArguments)(call.argsText);
            updates.push({
                functionName: call.fullName,
                topic: this.topicForFunction(call.funcName),
                line: call.line,
                payload: this.payloadForFunction(call.funcName, parsed)
            });
        }
        return updates;
    }
    static validateUpdate(update) {
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
    static isHotReloadableFunction(funcName) {
        return [
            'set_vehicle_speed',
            'update_sensor_params',
            'set_weather',
            'set_vehicle_control',
            'update_scene_lighting'
        ].includes(funcName);
    }
    static topicForFunction(funcName) {
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
    static payloadForFunction(funcName, parsed) {
        const payload = this.argumentsToPayload(parsed);
        if (funcName === 'set_vehicle_speed') {
            payload.speed = (0, pythonCallParser_1.readNumericArgument)(parsed, 1, ['speed', 'speed_kmh', 'target_speed']);
        }
        if (funcName === 'update_sensor_params') {
            payload.sample_rate = (0, pythonCallParser_1.readNumericArgument)(parsed, 1, ['sample_rate', 'rate', 'frequency', 'fps']);
            payload.fov = (0, pythonCallParser_1.readNumericArgument)(parsed, 2, ['fov', 'angle', 'horizontal_fov']);
        }
        return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
    }
    static argumentsToPayload(parsed) {
        const payload = {};
        parsed.positional.forEach((arg, index) => {
            payload[`arg${index}`] = (0, pythonCallParser_1.parseLiteralValue)(arg);
        });
        for (const [name, value] of parsed.named) {
            payload[name] = (0, pythonCallParser_1.parseLiteralValue)(value);
        }
        return payload;
    }
    static readPayloadNumber(payload, names) {
        for (const name of names) {
            const value = payload[name];
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
        }
        return undefined;
    }
    async sendUpdate(update) {
        const config = vscode.workspace.getConfiguration('hutb.hotReload');
        const endpoint = config.get('mcpEndpoint', 'http://127.0.0.1:9000/hutb/hot-reload');
        const timeoutMs = config.get('timeoutMs', 1500);
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
exports.HutbHotReloadManager = HutbHotReloadManager;
function postJson(endpoint, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
        let url;
        try {
            url = new URL(endpoint);
        }
        catch {
            reject(new Error(`MCP 热重载地址无效: ${endpoint}`));
            return;
        }
        const body = JSON.stringify(payload);
        const transport = url.protocol === 'https:' ? https : http;
        const request = transport.request({
            method: 'POST',
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, response => {
            const chunks = [];
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
        });
        request.on('error', reject);
        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`MCP 连接超时 (${timeoutMs}ms)`));
        });
        request.write(body);
        request.end();
    });
}
//# sourceMappingURL=hotReload.js.map