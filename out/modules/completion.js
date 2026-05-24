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
exports.HutbCompletionProvider = void 0;
const vscode = __importStar(require("vscode"));
class HutbCompletionProvider {
    constructor(apiDefs) {
        this.apiDefs = apiDefs;
    }
    provideCompletionItems(document, position, _token, _context) {
        const lineText = document.lineAt(position).text;
        const linePrefix = lineText.substring(0, position.character);
        // 检查是否是 hutb. 或 mcp. 触发
        if (linePrefix.endsWith('hutb.')) {
            return this.getCompletionItems(this.apiDefs.hutb.functions, 'hutb');
        }
        if (linePrefix.endsWith('mcp.')) {
            return this.getCompletionItems(this.apiDefs.mcp.functions, 'mcp');
        }
        return undefined;
    }
    getCompletionItems(functions, moduleName) {
        return functions.map(func => {
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            // 构建参数签名
            const params = func.params.map(p => {
                const requiredMark = p.required ? '' : '?';
                return `${p.name}${requiredMark}: ${p.type}`;
            }).join(', ');
            item.detail = `${moduleName}.${func.name}(${params}) -> ${func.returnType}`;
            // 构建文档信息
            const docParts = [];
            docParts.push(func.description);
            docParts.push('');
            if (func.deprecated) {
                docParts.push(`⚠️ **已弃用** - 请使用 \`${func.replacement}\` 代替`);
                docParts.push('');
            }
            // 参数说明
            if (func.params.length > 0) {
                docParts.push('**参数：**');
                func.params.forEach(p => {
                    const required = p.required ? '（必填）' : '（可选）';
                    docParts.push(`- \`${p.name}\` (*${p.type}*) ${required}: ${p.description}`);
                });
                docParts.push('');
            }
            docParts.push(`**返回值：** \`${func.returnType}\``);
            docParts.push('');
            docParts.push('**示例：**');
            docParts.push('```python');
            docParts.push(func.example);
            docParts.push('```');
            const documentation = new vscode.MarkdownString(docParts.join('\n'));
            documentation.isTrusted = true;
            item.documentation = documentation;
            // 构建代码片段（自动填充参数占位符）
            const snippetParams = func.params
                .filter(p => p.required)
                .map((p, i) => `\${${i + 1}:${p.name}}`)
                .join(', ');
            item.insertText = new vscode.SnippetString(`${func.name}(${snippetParams})`);
            // 已弃用的函数添加标记
            if (func.deprecated) {
                item.tags = [vscode.CompletionItemTag.Deprecated];
            }
            item.sortText = func.deprecated ? `z_${func.name}` : `a_${func.name}`;
            return item;
        });
    }
}
exports.HutbCompletionProvider = HutbCompletionProvider;
//# sourceMappingURL=completion.js.map