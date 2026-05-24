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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const completion_1 = require("./modules/completion");
const diagnostics_1 = require("./modules/diagnostics");
const packager_1 = require("./modules/packager");
const debugger_1 = require("./modules/debugger");
const statusBar_1 = require("./modules/statusBar");
const apiLoader_1 = require("./utils/apiLoader");
const hotReload_1 = require("./modules/hotReload");
const simulationMonitor_1 = require("./modules/simulationMonitor");
const apiHelp_1 = require("./modules/apiHelp");
const scriptTemplates_1 = require("./modules/scriptTemplates");
const batchSimulation_1 = require("./modules/batchSimulation");
const scenePreview_1 = require("./modules/scenePreview");
const simulationSnapshot_1 = require("./modules/simulationSnapshot");
const experimentReport_1 = require("./modules/experimentReport");
let diagnosticProvider;
let statusBar;
function activate(context) {
    console.log('HUTB 人车模拟器开发助手已激活');
    // 加载 API 定义
    const apiLoader = new apiLoader_1.ApiDefinitionLoader(context);
    const apiDefs = apiLoader.load();
    // 1. 注册代码补全提供器（支持 file 和 untitled 两种文档协议）
    const completionProvider = new completion_1.HutbCompletionProvider(apiDefs);
    const completionDisposable = vscode.languages.registerCompletionItemProvider([
        { language: 'python', scheme: 'file' },
        { language: 'python', scheme: 'untitled' }
    ], completionProvider, '.' // 触发字符
    );
    context.subscriptions.push(completionDisposable);
    const signatureDisposable = vscode.languages.registerSignatureHelpProvider([
        { language: 'python', scheme: 'file' },
        { language: 'python', scheme: 'untitled' }
    ], new apiHelp_1.HutbSignatureHelpProvider(apiDefs), '(', ',');
    context.subscriptions.push(signatureDisposable);
    const hoverDisposable = vscode.languages.registerHoverProvider([
        { language: 'python', scheme: 'file' },
        { language: 'python', scheme: 'untitled' }
    ], new apiHelp_1.HutbHoverProvider(apiDefs));
    context.subscriptions.push(hoverDisposable);
    // 2. 注册错误检查
    diagnosticProvider = new diagnostics_1.HutbDiagnosticProvider(apiDefs);
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('hutb');
    context.subscriptions.push(diagnosticCollection);
    diagnosticProvider.setDiagnosticCollection(diagnosticCollection);
    const codeActionProvider = new diagnostics_1.HutbCodeActionProvider(apiDefs);
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider([
        { language: 'python', scheme: 'file' },
        { language: 'python', scheme: 'untitled' }
    ], codeActionProvider, { providedCodeActionKinds: diagnostics_1.HutbCodeActionProvider.providedCodeActionKinds }));
    // 3. 状态栏、热重载和仿真监控
    statusBar = new statusBar_1.HutbStatusBar();
    context.subscriptions.push(statusBar);
    const hotReloadManager = new hotReload_1.HutbHotReloadManager(statusBar);
    context.subscriptions.push(hotReloadManager);
    const monitorProvider = new simulationMonitor_1.HutbSimulationMonitorProvider(context);
    context.subscriptions.push(monitorProvider);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(simulationMonitor_1.HutbSimulationMonitorProvider.viewType, monitorProvider));
    const scenePreviewProvider = new scenePreview_1.HutbScenePreviewProvider();
    context.subscriptions.push(scenePreviewProvider);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(scenePreview_1.HutbScenePreviewProvider.viewType, scenePreviewProvider));
    // 文件保存时进行错误检查
    const onSaveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId === 'python') {
            diagnosticProvider.analyze(doc);
            void hotReloadManager.handleSavedDocument(doc);
            scenePreviewProvider.refresh(doc);
        }
    });
    context.subscriptions.push(onSaveDisposable);
    // 文件内容变更时进行错误检查
    const onChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'python') {
            diagnosticProvider.analyze(event.document);
            scenePreviewProvider.refresh(event.document);
        }
    });
    context.subscriptions.push(onChangeDisposable);
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        scenePreviewProvider.refresh(editor?.document);
    }));
    // 激活时检查已打开的文件
    if (vscode.window.activeTextEditor?.document.languageId === 'python') {
        diagnosticProvider.analyze(vscode.window.activeTextEditor.document);
        scenePreviewProvider.refresh(vscode.window.activeTextEditor.document);
    }
    // 4. 注册打包命令
    const packager = new packager_1.HutbPackager(context);
    const packCmd = vscode.commands.registerCommand('hutb.packEnvironment', () => {
        packager.pack();
    });
    context.subscriptions.push(packCmd);
    // 5. 注册调试相关命令
    const debugger_ = new debugger_1.HutbDebugger(context);
    const debugCmd = vscode.commands.registerCommand('hutb.startDebug', () => {
        debugger_.startDebug();
    });
    context.subscriptions.push(debugCmd);
    const selectTemplateCmd = vscode.commands.registerCommand('hutb.selectDebugTemplate', () => {
        debugger_.selectTemplate();
    });
    context.subscriptions.push(selectTemplateCmd);
    const openMonitorCmd = vscode.commands.registerCommand('hutb.openSimulationMonitor', () => {
        vscode.commands.executeCommand('hutb.simulationMonitor.focus');
    });
    context.subscriptions.push(openMonitorCmd);
    const exportTelemetryCmd = vscode.commands.registerCommand('hutb.exportTelemetryCsv', () => {
        monitorProvider.exportCsv();
    });
    context.subscriptions.push(exportTelemetryCmd);
    const openScenePreviewCmd = vscode.commands.registerCommand('hutb.openScenePreview', () => {
        scenePreviewProvider.refresh();
        vscode.commands.executeCommand('hutb.scenePreview.focus');
    });
    context.subscriptions.push(openScenePreviewCmd);
    // 6. 注册仿真脚本模板、批量测试、快照续跑和实验报告命令
    const templateManager = new scriptTemplates_1.HutbScriptTemplateManager(context);
    const newSimulationScriptCmd = vscode.commands.registerCommand('hutb.newSimulationScript', (uri) => {
        templateManager.createScript(uri);
    });
    context.subscriptions.push(newSimulationScriptCmd);
    const saveTemplateCmd = vscode.commands.registerCommand('hutb.saveSimulationTemplate', () => {
        templateManager.saveActiveFileAsCustomTemplate();
    });
    context.subscriptions.push(saveTemplateCmd);
    const batchRunner = new batchSimulation_1.HutbBatchSimulationRunner(context);
    const createBatchConfigCmd = vscode.commands.registerCommand('hutb.createBatchTestConfig', (uri) => {
        batchRunner.createConfigFile(uri);
    });
    context.subscriptions.push(createBatchConfigCmd);
    const runBatchTestsCmd = vscode.commands.registerCommand('hutb.runBatchSimulationTests', (uri) => {
        batchRunner.runFromCommand(uri);
    });
    context.subscriptions.push(runBatchTestsCmd);
    const snapshotManager = new simulationSnapshot_1.HutbSimulationSnapshotManager(context);
    const saveSnapshotCmd = vscode.commands.registerCommand('hutb.saveSimulationSnapshot', () => {
        snapshotManager.saveSnapshot();
    });
    context.subscriptions.push(saveSnapshotCmd);
    const loadSnapshotCmd = vscode.commands.registerCommand('hutb.loadSimulationSnapshot', (uri) => {
        snapshotManager.loadSnapshotAndResume(uri);
    });
    context.subscriptions.push(loadSnapshotCmd);
    const reportGenerator = new experimentReport_1.HutbExperimentReportGenerator(context);
    const generateReportCmd = vscode.commands.registerCommand('hutb.generateExperimentReport', () => {
        reportGenerator.generateFromActiveDocument();
    });
    context.subscriptions.push(generateReportCmd);
    // 7. 注册测试和发布命令
    const runTestsCmd = vscode.commands.registerCommand('hutb.runTests', () => {
        const terminal = vscode.window.createTerminal('HUTB Tests');
        terminal.show();
        terminal.sendText('npm test');
    });
    context.subscriptions.push(runTestsCmd);
    const packageExtCmd = vscode.commands.registerCommand('hutb.packageExtension', () => {
        const terminal = vscode.window.createTerminal('HUTB Package');
        terminal.show();
        terminal.sendText('npx @vscode/vsce package');
    });
    context.subscriptions.push(packageExtCmd);
    const publishExtCmd = vscode.commands.registerCommand('hutb.publishExtension', () => {
        const terminal = vscode.window.createTerminal('HUTB Publish');
        terminal.show();
        terminal.sendText('npx @vscode/vsce publish');
    });
    context.subscriptions.push(publishExtCmd);
    vscode.window.showInformationMessage('HUTB 人车模拟器开发助手已就绪！');
}
function deactivate() {
    if (statusBar) {
        statusBar.dispose();
    }
}
//# sourceMappingURL=extension.js.map