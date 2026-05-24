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
suite('错误检查测试', () => {
    let apiDefs;
    let diagnosticProvider;
    let diagnosticCollection;
    setup(() => {
        // 直接加载 API 定义
        const apiPath = path.join(__dirname, '../../../data/api-definitions.json');
        const content = fs.readFileSync(apiPath, 'utf-8');
        apiDefs = JSON.parse(content);
        diagnosticProvider = new diagnostics_1.HutbDiagnosticProvider(apiDefs);
        diagnosticCollection = vscode.languages.createDiagnosticCollection('hutb-test');
        diagnosticProvider.setDiagnosticCollection(diagnosticCollection);
    });
    teardown(() => {
        diagnosticCollection.dispose();
    });
    test('应检测未知函数名', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\nhutb.unknown_function()'
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri);
        assert.ok(diagnostics, '应产生诊断信息');
        assert.ok(diagnostics.length > 0, '应检测到错误');
        const errorDiag = diagnostics.find(d => d.code === 'unknown-function');
        assert.ok(errorDiag, '应产生 unknown-function 错误');
        assert.strictEqual(errorDiag.severity, vscode.DiagnosticSeverity.Error);
    });
    test('应检测拼写相近的函数并给出建议', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\nhutb.init_simulater()'
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri);
        assert.ok(diagnostics && diagnostics.length > 0, '应检测到错误');
        const errorDiag = diagnostics.find(d => d.code === 'unknown-function');
        assert.ok(errorDiag, '应产生 unknown-function 错误');
        assert.ok(errorDiag.message.includes('init_simulator'), '应建议正确的函数名 init_simulator');
    });
    test('应检测已弃用函数', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\nhutb.init_sensor(car, "lidar")'
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri);
        assert.ok(diagnostics, '应产生诊断信息');
        const warningDiag = diagnostics.find(d => d.code === 'deprecated-function');
        assert.ok(warningDiag, '应产生 deprecated-function 警告');
        assert.strictEqual(warningDiag.severity, vscode.DiagnosticSeverity.Warning);
        assert.ok(warningDiag.message.includes('add_sensor'), '应建议使用 add_sensor');
    });
    test('应检测参数数量不足', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\nhutb.create_vehicle()'
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri);
        assert.ok(diagnostics, '应产生诊断信息');
        const errorDiag = diagnostics.find(d => d.code === 'missing-arguments');
        assert.ok(errorDiag, '应产生 missing-arguments 错误');
    });
    test('应检测参数数量过多', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\nhutb.stop_simulation(1, 2, 3)'
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri);
        assert.ok(diagnostics, '应产生诊断信息');
        const warningDiag = diagnostics.find(d => d.code === 'too-many-arguments');
        assert.ok(warningDiag, '应产生 too-many-arguments 警告');
    });
    test('正确的 API 调用不应产生错误', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\nsim = hutb.init_simulator()\nhutb.stop_simulation()'
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri);
        assert.ok(!diagnostics || diagnostics.length === 0, '正确的调用不应产生错误');
    });
    test('MCP 函数也应被检查', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import mcp\nmcp.unknown_func()'
        });
        diagnosticProvider.analyze(doc);
        const diagnostics = diagnosticCollection.get(doc.uri);
        assert.ok(diagnostics && diagnostics.length > 0, '应检测到 MCP 未知函数');
    });
});
//# sourceMappingURL=diagnostics.test.js.map