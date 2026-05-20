import * as vscode from 'vscode';
import { ApiDefinitions, ApiFunction } from '../utils/apiLoader';

export class HutbDiagnosticProvider {
    private apiDefs: ApiDefinitions;
    private diagnosticCollection!: vscode.DiagnosticCollection;
    private allFunctions: Map<string, ApiFunction> = new Map();

    constructor(apiDefs: ApiDefinitions) {
        this.apiDefs = apiDefs;
        this.buildFunctionMap();
    }

    public setDiagnosticCollection(collection: vscode.DiagnosticCollection) {
        this.diagnosticCollection = collection;
    }

    private buildFunctionMap() {
        for (const func of this.apiDefs.hutb.functions) {
            this.allFunctions.set(`hutb.${func.name}`, func);
        }
        for (const func of this.apiDefs.mcp.functions) {
            this.allFunctions.set(`mcp.${func.name}`, func);
        }
    }

    public analyze(document: vscode.TextDocument) {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        // 匹配 hutb.xxx(...) 和 mcp.xxx(...) 的调用模式
        const callPattern = /\b(hutb|mcp)\.(\w+)\s*\(([^)]*)\)/g;
        let match: RegExpExecArray | null;

        while ((match = callPattern.exec(text)) !== null) {
            const moduleName = match[1];
            const funcName = match[2];
            const argsStr = match[3];
            const fullName = `${moduleName}.${funcName}`;

            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);

            // 在模块中查找函数名
            const funcNameStartOffset = match.index + moduleName.length + 1;
            const funcNameEndOffset = funcNameStartOffset + funcName.length;
            const funcNameRange = new vscode.Range(
                document.positionAt(funcNameStartOffset),
                document.positionAt(funcNameEndOffset)
            );

            const funcDef = this.allFunctions.get(fullName);

            if (!funcDef) {
                // 检查是否为模块中的未知函数（可能是拼写错误）
                const suggestion = this.findSimilarFunction(moduleName, funcName);
                const message = suggestion
                    ? `未知函数 '${fullName}'，您是否想使用 '${suggestion}'？`
                    : `未知函数 '${fullName}'，该函数未在 API 定义中找到。`;

                const diagnostic = new vscode.Diagnostic(
                    funcNameRange,
                    message,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = 'HUTB';
                diagnostic.code = 'unknown-function';
                diagnostics.push(diagnostic);
                continue;
            }

            // 检查弃用
            if (funcDef.deprecated) {
                const message = `'${fullName}' 已弃用，请使用 '${moduleName}.${funcDef.replacement}' 代替。`;
                const diagnostic = new vscode.Diagnostic(
                    funcNameRange,
                    message,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = 'HUTB';
                diagnostic.code = 'deprecated-function';
                diagnostics.push(diagnostic);
            }

            // 检查参数数量
            const requiredParams = funcDef.params.filter(p => p.required);
            const argCount = this.countArguments(argsStr);

            if (argCount < requiredParams.length) {
                const message = `'${fullName}' 需要至少 ${requiredParams.length} 个必填参数，但只提供了 ${argCount} 个。\n必填参数: ${requiredParams.map(p => p.name).join(', ')}`;
                const diagnostic = new vscode.Diagnostic(
                    range,
                    message,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = 'HUTB';
                diagnostic.code = 'missing-arguments';
                diagnostics.push(diagnostic);
            }

            if (argCount > funcDef.params.length) {
                const message = `'${fullName}' 最多接受 ${funcDef.params.length} 个参数，但提供了 ${argCount} 个。`;
                const diagnostic = new vscode.Diagnostic(
                    range,
                    message,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = 'HUTB';
                diagnostic.code = 'too-many-arguments';
                diagnostics.push(diagnostic);
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private countArguments(argsStr: string): number {
        const trimmed = argsStr.trim();
        if (trimmed === '') {
            return 0;
        }

        // 简单的参数计数：按逗号分割，忽略括号和字符串内的逗号
        let count = 0;
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < trimmed.length; i++) {
            const ch = trimmed[i];

            if (inString) {
                if (ch === stringChar && trimmed[i - 1] !== '\\') {
                    inString = false;
                }
                continue;
            }

            if (ch === '"' || ch === "'") {
                inString = true;
                stringChar = ch;
                continue;
            }

            if (ch === '(' || ch === '[' || ch === '{') {
                depth++;
            } else if (ch === ')' || ch === ']' || ch === '}') {
                depth--;
            } else if (ch === ',' && depth === 0) {
                count++;
            }
        }

        return count + 1;
    }

    private findSimilarFunction(moduleName: string, funcName: string): string | null {
        const funcs = moduleName === 'hutb'
            ? this.apiDefs.hutb.functions
            : this.apiDefs.mcp.functions;

        let bestMatch: string | null = null;
        let bestScore = 0;

        for (const func of funcs) {
            const score = this.similarity(funcName, func.name);
            if (score > bestScore && score > 0.5) {
                bestScore = score;
                bestMatch = `${moduleName}.${func.name}`;
            }
        }

        return bestMatch;
    }

    private similarity(a: string, b: string): number {
        // 简单的编辑距离相似度计算
        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;

        if (longer.length === 0) {
            return 1.0;
        }

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    private levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = b[i - 1] === a[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[b.length][a.length];
    }
}
