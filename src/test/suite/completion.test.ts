import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('代码补全测试', () => {
    const extensionId = 'OpenHUTB.hutb-simulator-dev';

    test('插件应成功激活', async () => {
        // 等待插件激活
        const ext = vscode.extensions.getExtension(extensionId);
        if (ext) {
            await ext.activate();
            assert.ok(ext.isActive, '插件应处于激活状态');
        }
    });

    test('输入 hutb. 应触发补全', async () => {
        // 创建一个临时 Python 文件
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\nhutb.'
        });

        const editor = await vscode.window.showTextDocument(doc);
        const position = new vscode.Position(1, 5); // hutb. 之后

        // 触发补全，传入触发字符 '.' 和足够大的 resolveCount
        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            position,
            '.',
            50
        );

        assert.ok(completions, '应返回补全列表');
        assert.ok(completions.items.length > 0, '补全列表不应为空');

        // 检查是否包含核心函数
        const getLabel = (item: vscode.CompletionItem): string => {
            if (typeof item.label === 'string') { return item.label; }
            return (item.label as vscode.CompletionItemLabel).label;
        };
        const names = completions.items.map(getLabel);

        assert.ok(names.includes('init_simulator'), '应包含 init_simulator，实际: ' + names.join(', '));
        assert.ok(names.includes('load_scene'), '应包含 load_scene，实际: ' + names.join(', '));
        assert.ok(names.includes('create_vehicle'), '应包含 create_vehicle，实际: ' + names.join(', '));
    });

    test('输入 mcp. 应触发补全', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import mcp\nmcp.'
        });

        const editor = await vscode.window.showTextDocument(doc);
        const position = new vscode.Position(1, 4);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            position,
            '.',
            50
        );

        assert.ok(completions, '应返回补全列表');
        assert.ok(completions.items.length > 0, '补全列表不应为空');

        const getLabel = (item: vscode.CompletionItem): string => {
            if (typeof item.label === 'string') { return item.label; }
            return (item.label as vscode.CompletionItemLabel).label;
        };
        const names = completions.items.map(getLabel);

        assert.ok(names.includes('connect'), '应包含 connect，实际: ' + names.join(', '));
        assert.ok(names.includes('send_message'), '应包含 send_message，实际: ' + names.join(', '));
    });

    test('已弃用函数应有弃用标记', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'python',
            content: 'import hutb\nhutb.'
        });

        await vscode.window.showTextDocument(doc);
        const position = new vscode.Position(1, 5);

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            position,
            '.',
            50
        );

        const getLabel = (item: vscode.CompletionItem): string => {
            if (typeof item.label === 'string') { return item.label; }
            return (item.label as vscode.CompletionItemLabel).label;
        };

        const deprecatedItem = completions?.items.find(item => getLabel(item) === 'init_sensor');

        assert.ok(deprecatedItem, 'should find init_sensor in completion items');
        if (deprecatedItem) {
            assert.ok(
                deprecatedItem.tags?.includes(vscode.CompletionItemTag.Deprecated),
                'init_sensor 应有弃用标记'
            );
        }
    });
});
