import * as assert from 'assert';
import {
    extractScenePreviewModel,
    parsePointLiteral
} from '../../modules/scenePreview';
import {
    buildResumeDebugConfig,
    createSimulationSnapshot
} from '../../modules/simulationSnapshot';
import {
    buildDocxDocumentXml,
    buildMarkdownReport,
    createExperimentReportData,
    extractExperimentParameters
} from '../../modules/experimentReport';

const demoScript = [
    'import hutb',
    'sim = hutb.init_simulator()',
    'scene = hutb.load_scene("/scenes/urban_road.scene")',
    'ego = hutb.create_vehicle("sedan", (0, 0, 0), color="blue")',
    'npc = hutb.create_vehicle("suv", (30, 3.5, 0), color="white")',
    'camera = hutb.add_sensor(ego, "camera", position=(0, 0, 1.6))',
    'lidar = hutb.add_sensor(ego, "lidar", position=(0, 0, 2.2))',
    'ped = hutb.add_pedestrian((15, -2, 0), target=(15, 3, 0), speed=1.4)',
    'hutb.set_weather("rain", intensity=0.4)',
    'hutb.set_vehicle_speed(ego, speed=45)',
    'hutb.start_simulation(realtime=True, max_steps=500)',
    '# HUTB_RESULT:{"collision":false,"durationSeconds":18.5,"reachedTarget":true}'
].join('\n');

suite('HUTB 额外创新功能测试', () => {
    test('二维场景预览应提取车辆、传感器和行人布局', () => {
        assert.deepStrictEqual(parsePointLiteral('(1, 2, 3)'), { x: 1, y: 2, z: 3 });

        const model = extractScenePreviewModel(demoScript, 'demo.py');
        assert.strictEqual(model.scenePath, '/scenes/urban_road.scene');
        assert.strictEqual(model.vehicles.length, 2);
        assert.strictEqual(model.sensors.length, 2);
        assert.strictEqual(model.obstacles.length, 1);
        assert.strictEqual(model.vehicles[0].id, 'ego');
        assert.strictEqual(model.sensors[0].vehicleId, 'ego');
    });

    test('仿真状态快照应记录场景和可续跑调试环境', () => {
        const snapshot = createSimulationSnapshot(demoScript, {
            scriptPath: 'D:\\workspace\\demo.py',
            workspaceRoot: 'D:\\workspace',
            activeLine: 10
        });

        assert.strictEqual(snapshot.scene.vehicles.length, 2);
        assert.ok(snapshot.hotReloadParameters.some(item => item.functionName === 'hutb.set_vehicle_speed'));

        const config = buildResumeDebugConfig('D:\\workspace\\.hutb\\snapshots\\snapshot.json', snapshot, 'python');
        assert.strictEqual(config.name, 'HUTB: 从快照续跑');
        assert.strictEqual(config.env.HUTB_RESUME_LINE, '10');
        assert.ok(config.env.HUTB_RESUME_PARAMETERS.includes('vehicle/control/hot_reload'));
    });

    test('实验报告应汇总参数、结果并生成 Markdown', () => {
        const params = extractExperimentParameters(demoScript);
        assert.ok(params.some(item => item.name === '天气'));
        assert.ok(params.some(item => item.name === '目标车速'));

        const data = createExperimentReportData(demoScript, 'demo.py');
        const markdown = buildMarkdownReport(data);
        assert.ok(markdown.includes('HUTB 仿真实验报告'));
        assert.ok(markdown.includes('/scenes/urban_road.scene'));
        assert.ok(markdown.includes('collision'));
        assert.ok(markdown.includes('durationSeconds'));
    });

    test('Word 实验报告 XML 应包含核心章节', () => {
        const xml = buildDocxDocumentXml(createExperimentReportData(demoScript, 'demo.py'));
        assert.ok(xml.includes('HUTB 仿真实验报告'));
        assert.ok(xml.includes('场景对象'));
        assert.ok(xml.includes('实验参数'));
        assert.ok(xml.includes('实验结果'));
    });
});
