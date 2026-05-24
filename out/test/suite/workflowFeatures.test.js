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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const scriptTemplates_1 = require("../../modules/scriptTemplates");
const batchSimulation_1 = require("../../modules/batchSimulation");
suite('HUTB 模板与批量测试流程', () => {
    test('应提供三个内置仿真脚本模板', () => {
        assert.strictEqual(scriptTemplates_1.BUILTIN_SIMULATION_TEMPLATES.length, 3);
        const labels = scriptTemplates_1.BUILTIN_SIMULATION_TEMPLATES.map(template => template.label);
        assert.ok(labels.includes('基础单车辆控制模板'));
        assert.ok(labels.includes('多车协同场景模板'));
        assert.ok(labels.includes('传感器数据采集模板'));
        assert.ok(scriptTemplates_1.BUILTIN_SIMULATION_TEMPLATES[0].content.includes('hutb.init_simulator'));
    });
    test('应合并自定义模板并清洗 Python 文件名', () => {
        const items = (0, scriptTemplates_1.listTemplateItems)([
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
        assert.strictEqual((0, scriptTemplates_1.sanitizePythonFileName)('bad:name'), 'bad_name.py');
        assert.strictEqual((0, scriptTemplates_1.sanitizePythonFileName)('ready.py'), 'ready.py');
    });
    test('应解析批量测试配置并替换工作区变量', () => {
        const config = (0, batchSimulation_1.parseBatchConfig)(JSON.stringify((0, batchSimulation_1.createDefaultBatchConfig)()));
        assert.strictEqual(config.cases.length, 3);
        assert.ok(config.script.includes('${workspaceFolder}'));
        assert.strictEqual((0, batchSimulation_1.resolveConfigPathValue)('${workspaceFolder}/reports', 'D:\\workspace'), path.normalize('D:\\workspace/reports'));
    });
    test('应从 HUTB_RESULT 输出中提取指标并判定结果', () => {
        const metrics = (0, batchSimulation_1.extractSimulationMetrics)([
            'ordinary log',
            'HUTB_RESULT:{"collision":false,"durationSeconds":12.5,"reachedTarget":true}'
        ].join('\n'));
        const result = (0, batchSimulation_1.evaluateCaseResult)({
            name: 'case',
            params: { speed: 50 },
            expected: { collision: false, maxDurationSeconds: 20, maxExitCode: 0 }
        }, 0, metrics);
        assert.strictEqual(metrics.collision, false);
        assert.strictEqual(result.passed, true);
    });
    test('应生成包含统计与失败原因的 HTML 报告', () => {
        const html = (0, batchSimulation_1.generateHtmlReport)({
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
        fs.writeFileSync(scriptPath, [
            'const params = JSON.parse(process.env.HUTB_BATCH_PARAMS || "{}");',
            'console.log("HUTB_RESULT:" + JSON.stringify({',
            '  collision: false,',
            '  durationSeconds: params.speed > 40 ? 10 : 18,',
            '  reachedTarget: true',
            '}));'
        ].join('\n'), 'utf8');
        const runner = new batchSimulation_1.HutbBatchSimulationRunner({});
        const report = await runner.runConfig({
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
        }, tempDir);
        assert.strictEqual(report.total, 1);
        assert.strictEqual(report.passed, 1);
        assert.strictEqual(report.failed, 0);
    });
});
//# sourceMappingURL=workflowFeatures.test.js.map