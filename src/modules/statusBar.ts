import * as vscode from 'vscode';

export class HutbStatusBar implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;

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

    private async updateStatus() {
        // 获取 Python 路径
        const pythonPath = vscode.workspace.getConfiguration('hutb').get<string>('pythonPath') || '自动检测';
        const sdkVersion = vscode.workspace.getConfiguration('hutb').get<string>('sdkVersion') || '未知';

        this.statusBarItem.tooltip = [
            'HUTB 人车模拟器开发助手',
            `Python: ${pythonPath}`,
            `SDK 版本: ${sdkVersion}`,
            '',
            '点击启动调试'
        ].join('\n');
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
}
