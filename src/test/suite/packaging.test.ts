import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

suite('打包功能测试', () => {

    test('打包配置文件应存在且格式正确', () => {
        const configPath = path.join(__dirname, '../../../data/pack-config.json');
        assert.ok(fs.existsSync(configPath), '打包配置文件应存在');

        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);

        assert.ok(config.vscode, '应包含 vscode 配置');
        assert.ok(config.extensions, '应包含 extensions 列表');
        assert.ok(config.python, '应包含 python 配置');
        assert.ok(config.output, '应包含 output 配置');
    });

    test('API 定义文件应存在且格式正确', () => {
        const apiPath = path.join(__dirname, '../../../data/api-definitions.json');
        assert.ok(fs.existsSync(apiPath), 'API 定义文件应存在');

        const content = fs.readFileSync(apiPath, 'utf-8');
        const apiDefs = JSON.parse(content);

        assert.ok(apiDefs.hutb, '应包含 hutb 模块');
        assert.ok(apiDefs.mcp, '应包含 mcp 模块');
        assert.ok(Array.isArray(apiDefs.hutb.functions), 'hutb.functions 应为数组');
        assert.ok(Array.isArray(apiDefs.mcp.functions), 'mcp.functions 应为数组');
        assert.ok(apiDefs.hutb.functions.length > 0, 'HUTB 应至少包含一个函数定义');
        assert.ok(apiDefs.mcp.functions.length > 0, 'MCP 应至少包含一个函数定义');
    });

    test('API 定义中每个函数应有完整字段', () => {
        const apiPath = path.join(__dirname, '../../../data/api-definitions.json');
        const content = fs.readFileSync(apiPath, 'utf-8');
        const apiDefs = JSON.parse(content);

        const allFunctions = [
            ...apiDefs.hutb.functions,
            ...apiDefs.mcp.functions
        ];

        for (const func of allFunctions) {
            assert.ok(func.name, `函数应有 name 字段`);
            assert.ok(func.module, `${func.name} 应有 module 字段`);
            assert.ok(func.description, `${func.name} 应有 description 字段`);
            assert.ok(Array.isArray(func.params), `${func.name} 应有 params 数组`);
            assert.ok(func.returnType, `${func.name} 应有 returnType 字段`);
            assert.ok(func.example, `${func.name} 应有 example 字段`);
            assert.ok(typeof func.deprecated === 'boolean', `${func.name} 应有 deprecated 布尔字段`);

            // 检查参数字段
            for (const param of func.params) {
                assert.ok(param.name, `${func.name} 的参数应有 name`);
                assert.ok(param.type, `${func.name}.${param.name} 应有 type`);
                assert.ok(typeof param.required === 'boolean', `${func.name}.${param.name} 应有 required`);
                assert.ok(param.description, `${func.name}.${param.name} 应有 description`);
            }
        }
    });

    test('语法高亮文件应存在且格式正确', () => {
        const grammarPath = path.join(__dirname, '../../../syntaxes/hutb.tmLanguage.json');
        assert.ok(fs.existsSync(grammarPath), '语法高亮文件应存在');

        const content = fs.readFileSync(grammarPath, 'utf-8');
        const grammar = JSON.parse(content);

        assert.ok(grammar.scopeName, '应有 scopeName');
        assert.ok(grammar.patterns, '应有 patterns');
        assert.ok(grammar.repository, '应有 repository');
    });
});
