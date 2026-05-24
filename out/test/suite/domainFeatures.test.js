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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const diagnostics_1 = require("../../modules/diagnostics");
const hotReload_1 = require("../../modules/hotReload");
const simulationMonitor_1 = require("../../modules/simulationMonitor");
suite('HUTB 领域专属功能测试', () => {
    let apiDefs;
    let diagnosticProvider;
    let diagnosticCollection;
    setup(() => {
        const apiPath = path.join(__dirname, '../../../data/api-definitions.json');
        const content = fs.readFileSync(apiPath, 'utf-8');
        apiDefs = JSON.parse(content);
        diagnosticProvider = new diagnostics_1.HutbDiagnosticProvider(apiDefs);
        diagnosticCollection = vscode.languages.createDiagnosticCollection('hutb-domain-test');
        diagnosticProvider.setDiagnosticCollection(diagnosticCollection);
    });
    teardown(() => {
        diagnosticCollection.dispose();
    });
    test('应检测未初始化模拟器就创建车辆', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\ncar = hutb.create_vehicle("sedan", (0, 0, 0))'
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri) ?? [];
        assert.ok(diagnostics.some(d => d.code === 'simulation-init-order'), '应产生 simulation-init-order 错误');
    });
    test('应检测未知车辆或传感器引用', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: [
                'import hutb',
                'sim = hutb.init_simulator()',
                'state = hutb.get_vehicle_state(car)'
            ].join('\n')
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri) ?? [];
        assert.ok(diagnostics.some(d => d.code === 'unknown-simulation-entity'), '应检测不存在的车辆 ID');
    });
    test('应检测仿真参数越界', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: [
                'import hutb',
                'sim = hutb.init_simulator()',
                'car = hutb.create_vehicle("sedan", (0, 0, 0))',
                'hutb.set_vehicle_speed(car, speed=1000)'
            ].join('\n')
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri) ?? [];
        assert.ok(diagnostics.some(d => d.code === 'parameter-out-of-range'), '应检测车辆速度越界');
    });
    test('应为弃用 HUTB API 提供一键替换', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\nsensor = hutb.init_sensor(car, "lidar")'
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri) ?? [];
        const deprecated = diagnostics.find(d => d.code === 'deprecated-function');
        assert.ok(deprecated, '应产生 deprecated-function 诊断');
        const codeActionProvider = new diagnostics_1.HutbCodeActionProvider(apiDefs);
        const actions = codeActionProvider.provideCodeActions(doc, deprecated.range, {
            diagnostics: [deprecated],
            only: vscode.CodeActionKind.QuickFix,
            triggerKind: vscode.CodeActionTriggerKind.Invoke
        });
        assert.ok(actions.length > 0, '应提供快速修复');
        assert.strictEqual(actions[0].title, '替换为 add_sensor');
    });
    test('热重载应提取可增量更新的 HUTB 参数', () => {
        const updates = hotReload_1.HutbHotReloadManager.extractUpdates([
            'import hutb',
            'hutb.set_vehicle_speed(car, speed=50)',
            'hutb.update_sensor_params(camera, sample_rate=30, fov=90)'
        ].join('\n'));
        assert.strictEqual(updates.length, 2);
        assert.strictEqual(updates[0].topic, 'vehicle/control/hot_reload');
        assert.strictEqual(updates[0].payload.speed, 50);
        assert.strictEqual(updates[1].payload.sample_rate, 30);
        assert.strictEqual(updates[1].payload.fov, 90);
    });
    test('热重载应拒绝越界参数', () => {
        const [update] = hotReload_1.HutbHotReloadManager.extractUpdates('hutb.set_vehicle_speed(car, speed=1000)');
        const result = hotReload_1.HutbHotReloadManager.validateUpdate(update);
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason?.includes('超出'));
    });
    test('监控面板应标准化 HUTB 遥测并导出 CSV', () => {
        const sample = simulationMonitor_1.HutbSimulationMonitorProvider.normalizeTelemetry({
            vehicle_id: 'ego-1',
            position: { x: 12.5, y: -3 },
            speed: 48,
            accel: 1.2,
            steer: 0.1,
            sensors: {
                camera: { frames: 8 },
                lidar: { points: 22000 }
            }
        });
        assert.strictEqual(sample.vehicleId, 'ego-1');
        assert.strictEqual(sample.x, 12.5);
        assert.strictEqual(sample.lidarPoints, 22000);
        const csv = simulationMonitor_1.HutbSimulationMonitorProvider.toCsv([sample]);
        assert.ok(csv.includes('timestamp,vehicle_id,x,y,speed_kmh'));
        assert.ok(csv.includes('ego-1'));
    });
});
//# sourceMappingURL=domainFeatures.test.js.map