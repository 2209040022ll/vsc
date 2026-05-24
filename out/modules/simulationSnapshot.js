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
exports.HutbSimulationSnapshotManager = void 0;
exports.createSimulationSnapshot = createSimulationSnapshot;
exports.buildResumeDebugConfig = buildResumeDebugConfig;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const hotReload_1 = require("./hotReload");
const scenePreview_1 = require("./scenePreview");
function createSimulationSnapshot(scriptText, options = {}) {
    const createdAt = new Date().toISOString();
    const scene = (0, scenePreview_1.extractScenePreviewModel)(scriptText, options.scriptPath);
    const hotReloadParameters = hotReload_1.HutbHotReloadManager.extractUpdates(scriptText);
    return {
        version: 1,
        createdAt,
        scriptPath: options.scriptPath,
        workspaceRoot: options.workspaceRoot,
        activeLine: options.activeLine,
        scene,
        hotReloadParameters,
        resume: {
            mode: 'debug',
            env: {
                HUTB_RESUME_CREATED_AT: createdAt,
                HUTB_RESUME_LINE: String(options.activeLine ?? 1)
            }
        }
    };
}
function buildResumeDebugConfig(snapshotPath, snapshot, pythonPath) {
    const env = {
        HUTB_RESUME_SNAPSHOT: snapshotPath,
        HUTB_RESUME_CREATED_AT: snapshot.createdAt,
        HUTB_RESUME_LINE: String(snapshot.activeLine ?? 1),
        HUTB_RESUME_SCENE: snapshot.scene.scenePath ?? '',
        HUTB_RESUME_PARAMETERS: JSON.stringify(snapshot.hotReloadParameters.map(update => ({
            topic: update.topic,
            payload: update.payload,
            line: update.line + 1
        })))
    };
    const config = {
        name: 'HUTB: 从快照续跑',
        type: 'debugpy',
        request: 'launch',
        program: snapshot.scriptPath || '${file}',
        console: 'integratedTerminal',
        cwd: snapshot.workspaceRoot || '${workspaceFolder}',
        env,
        justMyCode: true
    };
    if (pythonPath) {
        config.python = pythonPath;
    }
    return config;
}
class HutbSimulationSnapshotManager {
    constructor(context) {
        this.context = context;
    }
    async saveSnapshot() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python') {
            vscode.window.showWarningMessage('请先打开一个 Python 仿真脚本。');
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const snapshot = createSimulationSnapshot(editor.document.getText(), {
            scriptPath: editor.document.uri.fsPath,
            workspaceRoot,
            activeLine: editor.selection.active.line + 1
        });
        const outputDir = this.resolveSnapshotDir(workspaceRoot);
        await fs.promises.mkdir(outputDir, { recursive: true });
        const fileName = `hutb-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filePath = path.join(outputDir, fileName);
        const snapshotToWrite = {
            ...snapshot,
            resume: {
                ...snapshot.resume,
                env: {
                    ...snapshot.resume.env,
                    HUTB_RESUME_SNAPSHOT: filePath
                }
            }
        };
        await fs.promises.writeFile(filePath, JSON.stringify(snapshotToWrite, null, 2), 'utf8');
        vscode.window.showInformationMessage(`HUTB 仿真状态快照已保存：${filePath}`);
    }
    async loadSnapshotAndResume(snapshotUri) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showWarningMessage('请先打开一个工作区。');
            return;
        }
        const targetUri = snapshotUri ?? await this.pickSnapshotFile(workspaceRoot);
        if (!targetUri) {
            return;
        }
        const snapshot = JSON.parse(await fs.promises.readFile(targetUri.fsPath, 'utf8'));
        const pythonPath = this.getPythonPath();
        const config = buildResumeDebugConfig(targetUri.fsPath, snapshot, pythonPath);
        await this.ensureLaunchConfig(vscode.workspace.workspaceFolders[0], config);
        const started = await vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], config);
        if (started) {
            vscode.window.showInformationMessage(`已从快照续跑：${targetUri.fsPath}`);
        }
        else {
            vscode.window.showWarningMessage('快照续跑调试启动失败，请检查 Python 环境和脚本路径。');
        }
    }
    async pickSnapshotFile(workspaceRoot) {
        const snapshotDir = this.resolveSnapshotDir(workspaceRoot);
        if (!fs.existsSync(snapshotDir)) {
            vscode.window.showWarningMessage('当前工作区还没有 HUTB 快照。');
            return undefined;
        }
        const files = (await fs.promises.readdir(snapshotDir))
            .filter(file => file.endsWith('.json'))
            .sort()
            .reverse();
        if (files.length === 0) {
            vscode.window.showWarningMessage('当前工作区还没有 HUTB 快照。');
            return undefined;
        }
        const selected = await vscode.window.showQuickPick(files.map(file => ({
            label: file,
            description: snapshotDir,
            uri: vscode.Uri.file(path.join(snapshotDir, file))
        })), { placeHolder: '选择要续跑的 HUTB 仿真快照' });
        return selected?.uri;
    }
    resolveSnapshotDir(workspaceRoot) {
        const configured = vscode.workspace.getConfiguration('hutb.snapshot').get('outputDir', '');
        if (configured) {
            return path.normalize(configured.replace(/\$\{workspaceFolder\}/g, workspaceRoot ?? this.context.extensionPath));
        }
        return path.join(workspaceRoot ?? this.context.extensionPath, '.hutb', 'snapshots');
    }
    async ensureLaunchConfig(workspaceFolder, config) {
        const vscodeFolderPath = path.join(workspaceFolder.uri.fsPath, '.vscode');
        const launchPath = path.join(vscodeFolderPath, 'launch.json');
        await fs.promises.mkdir(vscodeFolderPath, { recursive: true });
        let launchContent;
        try {
            const content = await fs.promises.readFile(launchPath, 'utf8');
            const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            launchContent = JSON.parse(cleaned);
        }
        catch {
            launchContent = { version: '0.2.0', configurations: [] };
        }
        const existingIndex = launchContent.configurations.findIndex(item => item.name === config.name);
        if (existingIndex >= 0) {
            launchContent.configurations[existingIndex] = config;
        }
        else {
            launchContent.configurations.push(config);
        }
        await fs.promises.writeFile(launchPath, JSON.stringify(launchContent, null, 4), 'utf8');
    }
    getPythonPath() {
        const configPath = vscode.workspace.getConfiguration('hutb').get('pythonPath');
        if (configPath) {
            return configPath;
        }
        return vscode.workspace.getConfiguration('python').get('defaultInterpreterPath');
    }
}
exports.HutbSimulationSnapshotManager = HutbSimulationSnapshotManager;
//# sourceMappingURL=simulationSnapshot.js.map