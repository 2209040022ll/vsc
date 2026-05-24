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
exports.HutbStatusBar = void 0;
const vscode = __importStar(require("vscode"));
class HutbStatusBar {
    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.text = '$(beaker) HUTB';
        this.statusBarItem.tooltip = 'HUTB 人车模拟器开发助手';
        this.statusBarItem.command = 'hutb.startDebug';
        this.statusBarItem.show();
        this.updateStatus();
    }
    updateStatus() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = undefined;
        }
        // 获取 Python 路径
        const pythonPath = vscode.workspace.getConfiguration('hutb').get('pythonPath') || '自动检测';
        const sdkVersion = vscode.workspace.getConfiguration('hutb').get('sdkVersion') || '未知';
        const hotReloadEnabled = vscode.workspace.getConfiguration('hutb.hotReload').get('enabled', true);
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
    showHotReloadResult(success, message) {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.statusBarItem.text = success ? '$(check) HUTB 热重载' : '$(error) HUTB 热重载';
        this.statusBarItem.tooltip = message;
        this.resetTimer = setTimeout(() => this.updateStatus(), 5000);
    }
    dispose() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.statusBarItem.dispose();
    }
}
exports.HutbStatusBar = HutbStatusBar;
//# sourceMappingURL=statusBar.js.map