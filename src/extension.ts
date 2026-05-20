import * as vscode from 'vscode';
import { HutbCompletionProvider } from './modules/completion';
import { HutbDiagnosticProvider } from './modules/diagnostics';
import { HutbPackager } from './modules/packager';
import { HutbDebugger } from './modules/debugger';
import { HutbStatusBar } from './modules/statusBar';
import { ApiDefinitionLoader } from './utils/apiLoader';

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

    // 2. 注册错误检查
    diagnosticProvider = new HutbDiagnosticProvider(apiDefs);
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('hutb');
    context.subscriptions.push(diagnosticCollection);
    diagnosticProvider.setDiagnosticCollection(diagnosticCollection);

    // 文件保存时进行错误检查
    const onSaveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId === 'python') {
            diagnosticProvider.analyze(doc);
        }
    });
    context.subscriptions.push(onSaveDisposable);

    // 文件内容变更时进行错误检查
    const onChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'python') {
            diagnosticProvider.analyze(event.document);
        }
    });
    context.subscriptions.push(onChangeDisposable);

    // 激活时检查已打开的文件
    if (vscode.window.activeTextEditor?.document.languageId === 'python') {
        diagnosticProvider.analyze(vscode.window.activeTextEditor.document);
    }

    // 3. 注册打包命令
    const packager = new HutbPackager(context);
    const packCmd = vscode.commands.registerCommand('hutb.packEnvironment', () => {
        packager.pack();
    });
    context.subscriptions.push(packCmd);

    // 4. 注册调试相关命令
    const debugger_ = new HutbDebugger(context);
    const debugCmd = vscode.commands.registerCommand('hutb.startDebug', () => {
        debugger_.startDebug();
    });
    context.subscriptions.push(debugCmd);

    const selectTemplateCmd = vscode.commands.registerCommand('hutb.selectDebugTemplate', () => {
        debugger_.selectTemplate();
    });
    context.subscriptions.push(selectTemplateCmd);

    // 5. 注册测试和发布命令
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

    // 6. 状态栏
    statusBar = new HutbStatusBar();
    context.subscriptions.push(statusBar);

    vscode.window.showInformationMessage('HUTB 人车模拟器开发助手已就绪！');
}

export function deactivate() {
    if (statusBar) {
        statusBar.dispose();
    }
}
