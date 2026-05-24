import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ApiDefinitions } from '../../utils/apiLoader';
import { HutbCodeActionProvider, HutbDiagnosticProvider } from '../../modules/diagnostics';
import { HutbHotReloadManager } from '../../modules/hotReload';
import { HutbSimulationMonitorProvider, TelemetrySample } from '../../modules/simulationMonitor';

suite('HUTB 领域专属功能测试', () => {
    let apiDefs: ApiDefinitions;
    let diagnosticProvider: HutbDiagnosticProvider;
    let diagnosticCollection: vscode.DiagnosticCollection;

    setup(() => {
        const apiPath = path.join(__dirname, '../../../data/api-definitions.json');
        const content = fs.readFileSync(apiPath, 'utf-8');
        apiDefs = JSON.parse(content) as ApiDefinitions;

        diagnosticProvider = new HutbDiagnosticProvider(apiDefs);
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
        assert.ok(
            diagnostics.some(d => d.code === 'simulation-init-order'),
            '应产生 simulation-init-order 错误'
        );
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
        assert.ok(
            diagnostics.some(d => d.code === 'unknown-simulation-entity'),
            '应检测不存在的车辆 ID'
        );
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
        assert.ok(
            diagnostics.some(d => d.code === 'parameter-out-of-range'),
            '应检测车辆速度越界'
        );
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

        const codeActionProvider = new HutbCodeActionProvider(apiDefs);
        const actions = codeActionProvider.provideCodeActions(
            doc,
            deprecated.range,
            {
                diagnostics: [deprecated],
                only: vscode.CodeActionKind.QuickFix,
                triggerKind: vscode.CodeActionTriggerKind.Invoke
            }
        );

        assert.ok(actions.length > 0, '应提供快速修复');
        assert.strictEqual(actions[0].title, '替换为 add_sensor');
    });

    test('热重载应提取可增量更新的 HUTB 参数', () => {
        const updates = HutbHotReloadManager.extractUpdates([
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
        const [update] = HutbHotReloadManager.extractUpdates('hutb.set_vehicle_speed(car, speed=1000)');
        const result = HutbHotReloadManager.validateUpdate(update);
        assert.strictEqual(result.valid, false);
        assert.ok(result.reason?.includes('超出'));
    });

    test('监控面板应标准化 HUTB 遥测并导出 CSV', () => {
        const sample = HutbSimulationMonitorProvider.normalizeTelemetry({
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

        const csv = HutbSimulationMonitorProvider.toCsv([sample as TelemetrySample]);
        assert.ok(csv.includes('timestamp,vehicle_id,x,y,speed_kmh'));
        assert.ok(csv.includes('ego-1'));
    });
});
