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
        assert.strictEqual(data.templates.length, 5, '应包含五种调试模板');
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

    test('五种多场景调试模板应覆盖核心仿真流程', () => {
        const templatePath = path.join(__dirname, '../../../data/debug-templates.json');
        const content = fs.readFileSync(templatePath, 'utf-8');
        const data = JSON.parse(content);

        const names = data.templates.map((t: { name: string }) => t.name);
        assert.deepStrictEqual(names, [
            '单车辆控制调试',
            '多车协同调试',
            '传感器数据采集调试',
            'MCP 热重载联调',
            '批量仿真用例调试'
        ]);

        const singleVehicle = data.templates.find(
            (t: { name: string }) => t.name === '单车辆控制调试'
        );
        assert.ok(singleVehicle, '应包含单车辆控制调试模板');
        assert.strictEqual(singleVehicle.config.type, 'debugpy');
        assert.strictEqual(singleVehicle.config.request, 'launch');
        assert.strictEqual(singleVehicle.config.program, '${file}');
    });
});
