import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface DebugTemplate {
    name: string;
    description: string;
    config: object;
}

interface DebugTemplatesFile {
    templates: DebugTemplate[];
}

export class HutbDebugger {
    private context: vscode.ExtensionContext;
    private templates: DebugTemplate[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadTemplates();
    }

    private loadTemplates() {
        const filePath = path.join(this.context.extensionPath, 'data', 'debug-templates.json');
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content) as DebugTemplatesFile;
            this.templates = data.templates;
        } catch (error) {
            vscode.window.showErrorMessage(`无法加载调试模板: ${error}`);
        }
    }

    public async startDebug() {
        // 检查当前活动文件
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('请先打开一个 Python 文件。');
            return;
        }

        if (editor.document.languageId !== 'python') {
            vscode.window.showErrorMessage('当前文件不是 Python 文件，请打开 .py 文件后重试。');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (!workspaceFolder) {
            vscode.window.showErrorMessage('请先打开一个工作区。');
            return;
        }

        // 获取 Python 解释器路径
        const pythonPath = this.getPythonPath();

        // 自动生成 launch.json 配置
        const debugConfig: vscode.DebugConfiguration = {
            name: 'HUTB: 调试当前脚本',
            type: 'debugpy',
            request: 'launch',
            program: filePath,
            console: 'integratedTerminal',
            cwd: workspaceFolder.uri.fsPath,
            env: {
                'HUTB_HOME': workspaceFolder.uri.fsPath
            },
            justMyCode: true
        };

        if (pythonPath) {
            debugConfig['python'] = pythonPath;
        }

        // 写入 launch.json
        await this.ensureLaunchConfig(workspaceFolder, debugConfig);

        // 启动调试
        const started = await vscode.debug.startDebugging(workspaceFolder, debugConfig);
        if (started) {
            vscode.window.showInformationMessage('HUTB 调试会话已启动。');
        } else {
            vscode.window.showErrorMessage('调试启动失败，请检查 Python 环境配置。');
        }
    }

    public async selectTemplate() {
        if (this.templates.length === 0) {
            vscode.window.showErrorMessage('没有可用的调试模板。');
            return;
        }

        const items = this.templates.map(t => ({
            label: t.name,
            description: t.description,
            template: t
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择调试模板'
        });

        if (!selected) {
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('请先打开一个工作区。');
            return;
        }

        // 将模板写入 launch.json
        const config = selected.template.config as vscode.DebugConfiguration;
        await this.ensureLaunchConfig(workspaceFolder, config);

        vscode.window.showInformationMessage(
            `调试模板 "${selected.label}" 已配置到 launch.json。`,
            '启动调试'
        ).then(result => {
            if (result === '启动调试') {
                vscode.debug.startDebugging(workspaceFolder, config);
            }
        });
    }

    private async ensureLaunchConfig(
        workspaceFolder: vscode.WorkspaceFolder,
        config: vscode.DebugConfiguration
    ) {
        const vscodeFolderPath = path.join(workspaceFolder.uri.fsPath, '.vscode');
        const launchPath = path.join(vscodeFolderPath, 'launch.json');

        if (!fs.existsSync(vscodeFolderPath)) {
            fs.mkdirSync(vscodeFolderPath, { recursive: true });
        }

        let launchContent: { version: string; configurations: vscode.DebugConfiguration[] };

        if (fs.existsSync(launchPath)) {
            try {
                const content = fs.readFileSync(launchPath, 'utf-8');
                // 去除注释后解析
                const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
                launchContent = JSON.parse(cleaned);
            } catch {
                launchContent = { version: '0.2.0', configurations: [] };
            }
        } else {
            launchContent = { version: '0.2.0', configurations: [] };
        }

        // 检查是否已存在同名配置
        const existingIndex = launchContent.configurations.findIndex(
            c => c.name === config.name
        );

        if (existingIndex >= 0) {
            launchContent.configurations[existingIndex] = config;
        } else {
            launchContent.configurations.push(config);
        }

        fs.writeFileSync(launchPath, JSON.stringify(launchContent, null, 4), 'utf-8');
    }

    private getPythonPath(): string | undefined {
        // 优先使用插件配置的 Python 路径
        const configPath = vscode.workspace.getConfiguration('hutb').get<string>('pythonPath');
        if (configPath) {
            return configPath;
        }

        // 尝试从 Python 扩展获取
        const pythonConfig = vscode.workspace.getConfiguration('python');
        const defaultPath = pythonConfig.get<string>('defaultInterpreterPath');
        if (defaultPath) {
            return defaultPath;
        }

        return undefined;
    }
}
