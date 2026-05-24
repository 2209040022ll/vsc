import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    BUILTIN_SIMULATION_TEMPLATES,
    listTemplateItems,
    sanitizePythonFileName
} from '../../modules/scriptTemplates';
import {
    HutbBatchSimulationRunner,
    createDefaultBatchConfig,
    evaluateCaseResult,
    extractSimulationMetrics,
    generateHtmlReport,
    parseBatchConfig,
    resolveConfigPathValue
} from '../../modules/batchSimulation';

suite('HUTB 模板与批量测试流程', () => {
    test('应提供三个内置仿真脚本模板', () => {
        assert.strictEqual(BUILTIN_SIMULATION_TEMPLATES.length, 3);
        const labels = BUILTIN_SIMULATION_TEMPLATES.map(template => template.label);
        assert.ok(labels.includes('基础单车辆控制模板'));
        assert.ok(labels.includes('多车协同场景模板'));
        assert.ok(labels.includes('传感器数据采集模板'));
        assert.ok(BUILTIN_SIMULATION_TEMPLATES[0].content.includes('hutb.init_simulator'));
    });

    test('应合并自定义模板并清洗 Python 文件名', () => {
        const items = listTemplateItems([
            {
                id: 'custom-demo',
                label: '自定义模板',
                description: 'demo',
                defaultFileName: 'demo.py',
                content: 'print("demo")'
            }
        ]);

        assert.strictEqual(items.length, 4);
        assert.strictEqual(items[3].custom, true);
        assert.strictEqual(sanitizePythonFileName('bad:name'), 'bad_name.py');
        assert.strictEqual(sanitizePythonFileName('ready.py'), 'ready.py');
    });

    test('应解析批量测试配置并替换工作区变量', () => {
        const config = parseBatchConfig(JSON.stringify(createDefaultBatchConfig()));
        assert.strictEqual(config.cases.length, 3);
        assert.ok(config.script.includes('${workspaceFolder}'));
        assert.strictEqual(
            resolveConfigPathValue('${workspaceFolder}/reports', 'D:\\workspace'),
            path.normalize('D:\\workspace/reports')
        );
    });

    test('应从 HUTB_RESULT 输出中提取指标并判定结果', () => {
        const metrics = extractSimulationMetrics([
            'ordinary log',
            'HUTB_RESULT:{"collision":false,"durationSeconds":12.5,"reachedTarget":true}'
        ].join('\n'));

        const result = evaluateCaseResult(
            {
                name: 'case',
                params: { speed: 50 },
                expected: { collision: false, maxDurationSeconds: 20, maxExitCode: 0 }
            },
            0,
            metrics
        );

        assert.strictEqual(metrics.collision, false);
        assert.strictEqual(result.passed, true);
    });

    test('应生成包含统计与失败原因的 HTML 报告', () => {
        const html = generateHtmlReport({
            name: '报告测试',
            script: 'demo.py',
            startedAt: '2026-05-20T00:00:00.000Z',
            finishedAt: '2026-05-20T00:00:01.000Z',
            total: 1,
            passed: 0,
            failed: 1,
            cases: [
                {
                    name: 'failed-case',
                    params: { speed: 100 },
                    passed: false,
                    exitCode: 1,
                    durationMs: 1000,
                    metrics: { collision: true },
                    failureReasons: ['发生碰撞'],
                    stdout: '',
                    stderr: ''
                }
            ]
        });

        assert.ok(html.includes('报告测试'));
        assert.ok(html.includes('failed-case'));
        assert.ok(html.includes('发生碰撞'));
    });

    test('批量测试运行器应执行脚本并汇总通过用例', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hutb-batch-'));
        const scriptPath = path.join(tempDir, 'case.js');
        fs.writeFileSync(
            scriptPath,
            [
                'const params = JSON.parse(process.env.HUTB_BATCH_PARAMS || "{}");',
                'console.log("HUTB_RESULT:" + JSON.stringify({',
                '  collision: false,',
                '  durationSeconds: params.speed > 40 ? 10 : 18,',
                '  reachedTarget: true',
                '}));'
            ].join('\n'),
            'utf8'
        );

        const runner = new HutbBatchSimulationRunner({} as never);
        const report = await runner.runConfig(
            {
                name: 'runner-test',
                script: scriptPath,
                pythonPath: process.execPath,
                timeoutMs: 10000,
                cases: [
                    {
                        name: 'speed-50',
                        params: { speed: 50 },
                        expected: { collision: false, maxDurationSeconds: 20, maxExitCode: 0 }
                    }
                ]
            },
            tempDir
        );

        assert.strictEqual(report.total, 1);
        assert.strictEqual(report.passed, 1);
        assert.strictEqual(report.failed, 0);
    });
});
