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
exports.HutbPackager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class HutbPackager {
    constructor(context) {
        this.context = context;
    }
    async pack() {
        // 让用户选择输出目录
        const outputUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: '选择打包输出目录'
        });
        if (!outputUri || outputUri.length === 0) {
            return;
        }
        const outputDir = outputUri[0].fsPath;
        // 读取打包配置
        const config = this.loadPackConfig();
        if (!config) {
            return;
        }
        // 获取插件配置中的路径
        const pluginConfig = vscode.workspace.getConfiguration('hutb.packConfig');
        const vscodePath = pluginConfig.get('vscodePath', '');
        const pythonEnvPath = pluginConfig.get('pythonEnvPath', '');
        if (!vscodePath || !pythonEnvPath) {
            const result = await vscode.window.showWarningMessage('请先在设置中配置 VSCode 便携版路径和 Python 环境路径。', '打开设置');
            if (result === '打开设置') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'hutb.packConfig');
            }
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'HUTB 一键打包',
            cancellable: true
        }, async (progress, token) => {
            try {
                progress.report({ message: '正在准备打包...', increment: 0 });
                // 创建临时打包目录
                const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
                const packageName = config.output.namePattern
                    .replace('{version}', '0.1.0')
                    .replace('{date}', date);
                const tempDir = path.join(outputDir, packageName);
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                if (token.isCancellationRequested) {
                    return;
                }
                // Step 1: 复制 VSCode 便携版
                progress.report({ message: '正在复制 VSCode 便携版...', increment: 20 });
                if (fs.existsSync(vscodePath)) {
                    await this.copyDirectory(vscodePath, path.join(tempDir, 'vscode'));
                }
                else {
                    vscode.window.showErrorMessage(`VSCode 便携版路径不存在: ${vscodePath}`);
                    return;
                }
                if (token.isCancellationRequested) {
                    return;
                }
                // Step 2: 复制 Python 环境
                progress.report({ message: '正在复制 Python 环境...', increment: 20 });
                if (fs.existsSync(pythonEnvPath)) {
                    await this.copyDirectory(pythonEnvPath, path.join(tempDir, 'python'));
                }
                else {
                    vscode.window.showErrorMessage(`Python 环境路径不存在: ${pythonEnvPath}`);
                    return;
                }
                if (token.isCancellationRequested) {
                    return;
                }
                // Step 3: 复制插件
                progress.report({ message: '正在复制插件...', increment: 10 });
                const extensionsDir = path.join(tempDir, 'vscode', 'data', 'extensions');
                if (!fs.existsSync(extensionsDir)) {
                    fs.mkdirSync(extensionsDir, { recursive: true });
                }
                await this.copyDirectory(this.context.extensionPath, path.join(extensionsDir, 'hutb-simulator-dev'));
                if (token.isCancellationRequested) {
                    return;
                }
                // Step 4: 生成启动脚本
                progress.report({ message: '正在生成启动脚本...', increment: 10 });
                this.generateStartScript(tempDir);
                // Step 5: 生成 VSCode 配置
                progress.report({ message: '正在生成配置文件...', increment: 10 });
                this.generateVSCodeSettings(tempDir);
                // Step 6: 复制示例项目
                if (config.sampleProject.include) {
                    progress.report({ message: '正在复制示例项目...', increment: 10 });
                    this.generateSampleProject(tempDir);
                }
                // Step 7: 压缩为 ZIP
                progress.report({ message: '正在压缩为 ZIP 文件...', increment: 15 });
                const zipPath = path.join(outputDir, `${packageName}.zip`);
                await this.createZip(tempDir, zipPath);
                // 清理临时目录
                progress.report({ message: '正在清理临时文件...', increment: 5 });
                vscode.window.showInformationMessage(`打包完成！文件保存在: ${zipPath}`, '打开所在目录').then(result => {
                    if (result === '打开所在目录') {
                        vscode.env.openExternal(vscode.Uri.file(outputDir));
                    }
                });
            }
            catch (error) {
                vscode.window.showErrorMessage(`打包失败: ${error}`);
            }
        });
    }
    loadPackConfig() {
        const configPath = path.join(this.context.extensionPath, 'data', 'pack-config.json');
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            vscode.window.showErrorMessage(`无法加载打包配置文件: ${error}`);
            return null;
        }
    }
    generateStartScript(targetDir) {
        const batContent = `@echo off
chcp 65001 >nul
echo ========================================
echo   HUTB 人车模拟器开发环境
echo ========================================
echo.

set "CURRENT_DIR=%~dp0"
set "PYTHON_PATH=%CURRENT_DIR%python"
set "PATH=%PYTHON_PATH%;%PYTHON_PATH%\\Scripts;%PATH%"
set "PYTHONPATH=%CURRENT_DIR%workspace"
set "HUTB_HOME=%CURRENT_DIR%workspace"

echo [INFO] Python 环境: %PYTHON_PATH%
echo [INFO] 正在启动 VSCode...
echo.

start "" "%CURRENT_DIR%vscode\\Code.exe" --extensions-dir "%CURRENT_DIR%vscode\\data\\extensions" --user-data-dir "%CURRENT_DIR%vscode\\data\\user-data" "%CURRENT_DIR%workspace"
`;
        fs.writeFileSync(path.join(targetDir, 'start.bat'), batContent, 'utf-8');
    }
    generateVSCodeSettings(targetDir) {
        const userDataDir = path.join(targetDir, 'vscode', 'data', 'user-data', 'User');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }
        const settings = {
            "python.defaultInterpreterPath": "${env:PYTHON_PATH}/python.exe",
            "python.analysis.autoSearchPaths": true,
            "editor.fontSize": 14,
            "editor.tabSize": 4,
            "files.encoding": "utf8",
            "terminal.integrated.defaultProfile.windows": "Command Prompt"
        };
        fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8');
    }
    generateSampleProject(targetDir) {
        const workspaceDir = path.join(targetDir, 'workspace');
        if (!fs.existsSync(workspaceDir)) {
            fs.mkdirSync(workspaceDir, { recursive: true });
        }
        // 生成示例脚本
        const sampleCode = `"""
HUTB 人车模拟器 - 示例脚本
本脚本演示了如何使用 HUTB SDK 创建基本的仿真场景
"""

import hutb
import mcp

def main():
    # 1. 初始化模拟器
    sim = hutb.init_simulator(host='localhost', port=8000)
    
    # 2. 加载场景
    scene = hutb.load_scene('/scenes/highway.scene')
    
    # 3. 创建车辆
    car = hutb.create_vehicle('sedan', (100, 0, 50), color='blue')
    
    # 4. 添加传感器
    lidar = hutb.add_sensor(car, 'lidar', position=(0, 0, 2.5))
    camera = hutb.add_sensor(car, 'camera', position=(0, 0, 1.8))
    
    # 5. 设置天气
    hutb.set_weather('clear')
    
    # 6. 建立 MCP 通信连接
    conn = mcp.connect('localhost:9000', protocol='tcp')
    
    # 7. 开始仿真
    hutb.start_simulation(realtime=True)
    
    try:
        for _ in range(1000):
            # 执行一步仿真
            result = hutb.step(delta_time=0.02)
            
            # 获取车辆状态
            state = hutb.get_vehicle_state(car)
            
            # 获取传感器数据
            lidar_data = hutb.get_sensor_data(lidar)
            
            # 发送状态数据
            mcp.send_message(conn, 'vehicle/state', {
                'position': state.position,
                'speed': state.speed
            })
            
            # 设置控制输入
            hutb.set_vehicle_control(car, throttle=0.5, steer=0.0)
    
    finally:
        # 停止仿真并清理
        hutb.stop_simulation()
        mcp.disconnect(conn)
        hutb.destroy(sim)

if __name__ == '__main__':
    main()
`;
        fs.writeFileSync(path.join(workspaceDir, 'example_simulation.py'), sampleCode, 'utf-8');
    }
    async copyDirectory(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            }
            else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
    async createZip(sourceDir, outputPath) {
        return new Promise((resolve, reject) => {
            try {
                // 使用 archiver 进行压缩
                const archiver = require('archiver');
                const output = fs.createWriteStream(outputPath);
                const archive = archiver('zip', { zlib: { level: 9 } });
                output.on('close', () => resolve());
                archive.on('error', (err) => reject(err));
                archive.pipe(output);
                archive.directory(sourceDir, path.basename(sourceDir));
                archive.finalize();
            }
            catch {
                // 如果 archiver 不可用，提示用户手动压缩
                vscode.window.showWarningMessage(`ZIP 压缩需要 archiver 依赖，请运行 npm install archiver。打包目录已准备好: ${sourceDir}`);
                resolve();
            }
        });
    }
}
exports.HutbPackager = HutbPackager;
//# sourceMappingURL=packager.js.map