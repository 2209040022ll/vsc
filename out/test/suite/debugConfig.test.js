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
const assert = __importStar(require("assert"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
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
        const names = data.templates.map((t) => t.name);
        assert.deepStrictEqual(names, [
            '单车辆控制调试',
            '多车协同调试',
            '传感器数据采集调试',
            'MCP 热重载联调',
            '批量仿真用例调试'
        ]);
        const singleVehicle = data.templates.find((t) => t.name === '单车辆控制调试');
        assert.ok(singleVehicle, '应包含单车辆控制调试模板');
        assert.strictEqual(singleVehicle.config.type, 'debugpy');
        assert.strictEqual(singleVehicle.config.request, 'launch');
        assert.strictEqual(singleVehicle.config.program, '${file}');
    });
});
//# sourceMappingURL=debugConfig.test.js.map