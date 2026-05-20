import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ApiParam {
    name: string;
    type: string;
    required: boolean;
    description: string;
}

export interface ApiFunction {
    name: string;
    module: string;
    description: string;
    params: ApiParam[];
    returnType: string;
    example: string;
    deprecated: boolean;
    replacement: string;
}

export interface ApiDefinitions {
    hutb: { functions: ApiFunction[] };
    mcp: { functions: ApiFunction[] };
}

export class ApiDefinitionLoader {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public load(): ApiDefinitions {
        const filePath = path.join(this.context.extensionPath, 'data', 'api-definitions.json');
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content) as ApiDefinitions;
        } catch (error) {
            vscode.window.showErrorMessage(`无法加载 API 定义文件: ${error}`);
            return { hutb: { functions: [] }, mcp: { functions: [] } };
        }
    }
}
