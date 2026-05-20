import * as vscode from 'vscode';
import { ApiDefinitions, ApiFunction } from '../utils/apiLoader';

export class HutbCompletionProvider implements vscode.CompletionItemProvider {
    private apiDefs: ApiDefinitions;

    constructor(apiDefs: ApiDefinitions) {
        this.apiDefs = apiDefs;
    }

    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): vscode.CompletionItem[] | undefined {
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

    private getCompletionItems(functions: ApiFunction[], moduleName: string): vscode.CompletionItem[] {
        return functions.map(func => {
            const item = new vscode.CompletionItem(
                func.name,
                vscode.CompletionItemKind.Function
            );

            // 构建参数签名
            const params = func.params.map(p => {
                const requiredMark = p.required ? '' : '?';
                return `${p.name}${requiredMark}: ${p.type}`;
            }).join(', ');

            item.detail = `${moduleName}.${func.name}(${params}) -> ${func.returnType}`;

            // 构建文档信息
            const docParts: string[] = [];
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
