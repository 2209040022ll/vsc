import * as vscode from 'vscode';
import { HutbCompletionProvider } from './modules/completion';
import { HutbCodeActionProvider, HutbDiagnosticProvider } from './modules/diagnostics';
import { HutbPackager } from './modules/packager';
import { HutbDebugger } from './modules/debugger';
import { HutbStatusBar } from './modules/statusBar';
import { ApiDefinitionLoader } from './utils/apiLoader';
import { HutbHotReloadManager } from './modules/hotReload';
import { HutbSimulationMonitorProvider } from './modules/simulationMonitor';
import { HutbHoverProvider, HutbSignatureHelpProvider } from './modules/apiHelp';
import { HutbScriptTemplateManager } from './modules/scriptTemplates';
import { HutbBatchSimulationRunner } from './modules/batchSimulation';
import { HutbScenePreviewProvider } from './modules/scenePreview';
import { HutbSimulationSnapshotManager } from './modules/simulationSnapshot';
import { HutbExperimentReportGenerator } from './modules/experimentReport';

let diagnosticProvider: HutbDiagnosticProvider;
let statusBar: HutbStatusBar;

export function activate(context: vscode.ExtensionContext) {
    console.log('HUTB 人车模拟器开发助手已激活');

    // 加载 API 定义
    const apiLoader = new ApiDefinitionLoader(context);
    const apiDefs = apiLoader.load();

    // 1. 注册代码补全提供器（支持 file 和 untitled 两种文档协议）
    const completionProvider = new HutbCompletionProvider(apiDefs);
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        [
            { language: 'python', scheme: 'file' },
            { language: 'python', scheme: 'untitled' }
        ],
        completionProvider,
        '.'  // 触发字符
    );
    context.subscriptions.push(completionDisposable);

    const signatureDisposable = vscode.languages.registerSignatureHelpProvider(
        [
            { language: 'python', scheme: 'file' },
            { language: 'python', scheme: 'untitled' }
        ],
        new HutbSignatureHelpProvider(apiDefs),
        '(',
        ','
    );
    context.subscriptions.push(signatureDisposable);

    const hoverDisposable = vscode.languages.registerHoverProvider(
        [
            { language: 'python', scheme: 'file' },
            { language: 'python', scheme: 'untitled' }
        ],
        new HutbHoverProvider(apiDefs)
    );
    context.subscriptions.push(hoverDisposable);

    // 2. 注册错误检查
    diagnosticProvider = new HutbDiagnosticProvider(apiDefs);
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('hutb');
    context.subscriptions.push(diagnosticCollection);
    diagnosticProvider.setDiagnosticCollection(diagnosticCollection);

    const codeActionProvider = new HutbCodeActionProvider(apiDefs);
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider(
        [
            { language: 'python', scheme: 'file' },
            { language: 'python', scheme: 'untitled' }
        ],
        codeActionProvider,
        { providedCodeActionKinds: HutbCodeActionProvider.providedCodeActionKinds }
    ));

    // 3. 状态栏、热重载和仿真监控
    statusBar = new HutbStatusBar();
    context.subscriptions.push(statusBar);

    const hotReloadManager = new HutbHotReloadManager(statusBar);
    context.subscriptions.push(hotReloadManager);

    const monitorProvider = new HutbSimulationMonitorProvider(context);
    context.subscriptions.push(monitorProvider);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(
        HutbSimulationMonitorProvider.viewType,
        monitorProvider
    ));

    const scenePreviewProvider = new HutbScenePreviewProvider();
    context.subscriptions.push(scenePreviewProvider);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(
        HutbScenePreviewProvider.viewType,
        scenePreviewProvider
    ));

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
    const packager = new HutbPackager(context);
    const packCmd = vscode.commands.registerCommand('hutb.packEnvironment', () => {
        packager.pack();
    });
    context.subscriptions.push(packCmd);

    // 5. 注册调试相关命令
    const debugger_ = new HutbDebugger(context);
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
    const templateManager = new HutbScriptTemplateManager(context);
    const newSimulationScriptCmd = vscode.commands.registerCommand('hutb.newSimulationScript', (uri?: vscode.Uri) => {
        templateManager.createScript(uri);
    });
    context.subscriptions.push(newSimulationScriptCmd);

    const saveTemplateCmd = vscode.commands.registerCommand('hutb.saveSimulationTemplate', () => {
        templateManager.saveActiveFileAsCustomTemplate();
    });
    context.subscriptions.push(saveTemplateCmd);

    const batchRunner = new HutbBatchSimulationRunner(context);
    const createBatchConfigCmd = vscode.commands.registerCommand('hutb.createBatchTestConfig', (uri?: vscode.Uri) => {
        batchRunner.createConfigFile(uri);
    });
    context.subscriptions.push(createBatchConfigCmd);

    const runBatchTestsCmd = vscode.commands.registerCommand('hutb.runBatchSimulationTests', (uri?: vscode.Uri) => {
        batchRunner.runFromCommand(uri);
    });
    context.subscriptions.push(runBatchTestsCmd);

    const snapshotManager = new HutbSimulationSnapshotManager(context);
    const saveSnapshotCmd = vscode.commands.registerCommand('hutb.saveSimulationSnapshot', () => {
        snapshotManager.saveSnapshot();
    });
    context.subscriptions.push(saveSnapshotCmd);

    const loadSnapshotCmd = vscode.commands.registerCommand('hutb.loadSimulationSnapshot', (uri?: vscode.Uri) => {
        snapshotManager.loadSnapshotAndResume(uri);
    });
    context.subscriptions.push(loadSnapshotCmd);

    const reportGenerator = new HutbExperimentReportGenerator(context);
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

export function deactivate() {
    if (statusBar) {
        statusBar.dispose();
    }
}
