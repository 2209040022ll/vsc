import * as vscode from 'vscode';

export class HutbStatusBar implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private resetTimer: NodeJS.Timeout | undefined;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

        this.statusBarItem.text = '$(beaker) HUTB';
        this.statusBarItem.tooltip = 'HUTB 人车模拟器开发助手';
        this.statusBarItem.command = 'hutb.startDebug';
        this.statusBarItem.show();

        this.updateStatus();
    }

    public updateStatus() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = undefined;
        }

        // 获取 Python 路径
        const pythonPath = vscode.workspace.getConfiguration('hutb').get<string>('pythonPath') || '自动检测';
        const sdkVersion = vscode.workspace.getConfiguration('hutb').get<string>('sdkVersion') || '未知';
        const hotReloadEnabled = vscode.workspace.getConfiguration('hutb.hotReload').get<boolean>('enabled', true);

        this.statusBarItem.text = '$(beaker) HUTB';
        this.statusBarItem.tooltip = [
            'HUTB 人车模拟器开发助手',
            `Python: ${pythonPath}`,
            `SDK 版本: ${sdkVersion}`,
            `热重载: ${hotReloadEnabled ? '已启用' : '已关闭'}`,
            '',
            '点击启动调试'
        ].join('\n');
    }

    public showHotReloadResult(success: boolean, message: string) {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }

        this.statusBarItem.text = success ? '$(check) HUTB 热重载' : '$(error) HUTB 热重载';
        this.statusBarItem.tooltip = message;
        this.resetTimer = setTimeout(() => this.updateStatus(), 5000);
    }

    public dispose() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.statusBarItem.dispose();
    }
}
