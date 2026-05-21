import * as vscode from 'vscode';
import { ApiDefinitions, ApiFunction } from '../utils/apiLoader';

export class HutbSignatureHelpProvider implements vscode.SignatureHelpProvider {
    private readonly functions = new Map<string, ApiFunction>();

    constructor(apiDefs: ApiDefinitions) {
        for (const func of [...apiDefs.hutb.functions, ...apiDefs.mcp.functions]) {
            this.functions.set(`${func.module}.${func.name}`, func);
        }
    }

    public provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.SignatureHelp | undefined {
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        const match = /\b(hutb|mcp)\.(\w+)\s*\(([^()]*)$/.exec(linePrefix);
        if (!match) {
            return undefined;
        }

        const func = this.functions.get(`${match[1]}.${match[2]}`);
        if (!func) {
            return undefined;
        }

        const signatureHelp = new vscode.SignatureHelp();
        const params = func.params.map(param => `${param.name}${param.required ? '' : '?'}: ${param.type}`);
        const signature = new vscode.SignatureInformation(
            `${func.module}.${func.name}(${params.join(', ')}) -> ${func.returnType}`,
            new vscode.MarkdownString(func.description)
        );

        signature.parameters = func.params.map(param => new vscode.ParameterInformation(
            `${param.name}${param.required ? '' : '?'}: ${param.type}`,
            new vscode.MarkdownString(`${param.description}\n\n${param.required ? '必填参数' : '可选参数'}`)
        ));

        signatureHelp.signatures = [signature];
        signatureHelp.activeSignature = 0;
        signatureHelp.activeParameter = Math.min(
            func.params.length - 1,
            Math.max(0, (match[3].match(/,/g) ?? []).length)
        );
        return signatureHelp;
    }
}

export class HutbHoverProvider implements vscode.HoverProvider {
    private readonly functions = new Map<string, ApiFunction>();

    constructor(apiDefs: ApiDefinitions) {
        for (const func of [...apiDefs.hutb.functions, ...apiDefs.mcp.functions]) {
            this.functions.set(`${func.module}.${func.name}`, func);
        }
    }

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            return undefined;
        }

        const word = document.getText(range);
        const line = document.lineAt(position.line).text;
        const prefix = line.slice(0, range.start.character);
        const moduleMatch = /\b(hutb|mcp)\.$/.exec(prefix);
        if (!moduleMatch) {
            return undefined;
        }

        const func = this.functions.get(`${moduleMatch[1]}.${word}`);
        if (!func) {
            return undefined;
        }

        const params = func.params.map(param => `${param.name}${param.required ? '' : '?'}: ${param.type}`).join(', ');
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**${func.module}.${func.name}**\n\n`);
        markdown.appendCodeblock(`${func.module}.${func.name}(${params}) -> ${func.returnType}`, 'python');
        markdown.appendMarkdown(`\n${func.description}\n\n`);

        if (func.deprecated && func.replacement) {
            markdown.appendMarkdown(`**已弃用**：请使用 \`${func.module}.${func.replacement}\`。\n\n`);
        }

        if (func.params.length > 0) {
            markdown.appendMarkdown('**参数**\n\n');
            for (const param of func.params) {
                markdown.appendMarkdown(`- \`${param.name}\` (${param.type})：${param.description}\n`);
            }
        }

        return new vscode.Hover(markdown, range);
    }
}
