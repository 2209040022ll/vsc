import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

suite('调试配置测试', () => {

    test('调试模板文件应存在且格式正确', () => {
        const templatePath = path.join(__dirname, '../../../data/debug-templates.json');
        assert.ok(fs.existsSync(templatePath), '调试模板文件应存在');

        const content = fs.readFileSync(templatePath, 'utf-8');
        const data = JSON.parse(content);

        assert.ok(data.templates, '应包含 templates 字段');
        assert.ok(Array.isArray(data.templates), 'templates 应为数组');
        assert.ok(data.templates.length > 0, '应至少包含一个模板');
    });

    test('每个调试模板应有必要字段', () => {
        const templatePath = path.join(__dirname, '../../../data/debug-templates.json');
        const content = fs.readFileSync(templatePath, 'utf-8');
        const data = JSON.parse(content);

        for (const template of data.templates) {
            assert.ok(template.name, '模板应有 name 字段');
            assert.ok(template.description, '模板应有 description 字段');
            assert.ok(template.config, '模板应有 config 字段');
            assert.ok(template.config.type, '配置应有 type 字段');
            assert.ok(template.config.request, '配置应有 request 字段');
        }
    });

    test('单脚本调试模板应正确配置', () => {
        const templatePath = path.join(__dirname, '../../../data/debug-templates.json');
        const content = fs.readFileSync(templatePath, 'utf-8');
        const data = JSON.parse(content);

        const singleScript = data.templates.find(
            (t: { name: string }) => t.name === '单脚本调试'
        );
        assert.ok(singleScript, '应包含单脚本调试模板');
        assert.strictEqual(singleScript.config.type, 'debugpy');
        assert.strictEqual(singleScript.config.request, 'launch');
        assert.strictEqual(singleScript.config.program, '${file}');
    });
});
