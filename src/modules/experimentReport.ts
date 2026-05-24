import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findApiCalls, parseArguments, parseLiteralValue } from '../utils/pythonCallParser';
import { ScenePreviewModel, extractScenePreviewModel } from './scenePreview';

export interface ExperimentParameter {
    name: string;
    value: string;
    line: number;
}

export interface ExperimentReportData {
    title: string;
    generatedAt: string;
    scriptPath?: string;
    scene: ScenePreviewModel;
    parameters: ExperimentParameter[];
    resultSummary: Record<string, unknown>;
}

export function createExperimentReportData(scriptText: string, scriptPath?: string): ExperimentReportData {
    return {
        title: 'HUTB 仿真实验报告',
        generatedAt: new Date().toISOString(),
        scriptPath,
        scene: extractScenePreviewModel(scriptText, scriptPath),
        parameters: extractExperimentParameters(scriptText),
        resultSummary: extractInlineResultSummary(scriptText)
    };
}

export function extractExperimentParameters(scriptText: string): ExperimentParameter[] {
    const parameters: ExperimentParameter[] = [];
    for (const call of findApiCalls(scriptText)) {
        if (call.moduleName !== 'hutb') {
            continue;
        }

        const parsed = parseArguments(call.argsText);
        switch (call.funcName) {
            case 'load_scene':
                parameters.push({
                    name: '场景文件',
                    value: stringifyValue(parseLiteralValue(parsed.positional[0] ?? parsed.named.get('scene_path'))),
                    line: call.line + 1
                });
                break;
            case 'set_weather':
                parameters.push({
                    name: '天气',
                    value: [
                        stringifyValue(parseLiteralValue(parsed.positional[0] ?? parsed.named.get('weather_type'))),
                        namedValue(parsed.named.get('intensity'), '强度')
                    ].filter(Boolean).join('，'),
                    line: call.line + 1
                });
                break;
            case 'set_vehicle_speed':
                parameters.push({
                    name: '目标车速',
                    value: namedValue(parsed.named.get('speed') ?? parsed.named.get('speed_kmh') ?? parsed.positional[1], 'km/h'),
                    line: call.line + 1
                });
                break;
            case 'set_vehicle_control':
                parameters.push({
                    name: '车辆控制',
                    value: [
                        namedValue(parsed.named.get('throttle') ?? parsed.positional[1], '油门'),
                        namedValue(parsed.named.get('brake') ?? parsed.positional[2], '制动'),
                        namedValue(parsed.named.get('steer') ?? parsed.positional[3], '转向')
                    ].filter(Boolean).join('，'),
                    line: call.line + 1
                });
                break;
            case 'update_sensor_params':
                parameters.push({
                    name: '传感器参数',
                    value: [
                        namedValue(parsed.named.get('sample_rate') ?? parsed.positional[1], '采样率'),
                        namedValue(parsed.named.get('fov') ?? parsed.positional[2], '视场角')
                    ].filter(Boolean).join('，'),
                    line: call.line + 1
                });
                break;
            case 'start_simulation':
                parameters.push({
                    name: '仿真启动',
                    value: [
                        namedValue(parsed.named.get('realtime') ?? parsed.positional[0], '实时模式'),
                        namedValue(parsed.named.get('max_steps') ?? parsed.positional[1], '最大步数')
                    ].filter(Boolean).join('，') || '默认配置',
                    line: call.line + 1
                });
                break;
            case 'step':
                parameters.push({
                    name: '仿真步长',
                    value: namedValue(parsed.named.get('delta_time') ?? parsed.positional[0], '秒'),
                    line: call.line + 1
                });
                break;
        }
    }
    return parameters.filter(parameter => parameter.value.length > 0);
}

export function extractInlineResultSummary(scriptText: string): Record<string, unknown> {
    const resultPattern = /HUTB_RESULT:\s*(\{.*\})/g;
    let latest: Record<string, unknown> = {};
    let match: RegExpExecArray | null;

    while ((match = resultPattern.exec(scriptText)) !== null) {
        try {
            const parsed = JSON.parse(match[1]);
            if (typeof parsed === 'object' && parsed !== null) {
                latest = parsed as Record<string, unknown>;
            }
        } catch {
            // Ignore malformed examples in comments or strings.
        }
    }

    return latest;
}

export function buildMarkdownReport(data: ExperimentReportData): string {
    const scene = data.scene;
    const resultRows = Object.entries(data.resultSummary);
    return [
        `# ${data.title}`,
        '',
        `- 生成时间：${data.generatedAt}`,
        `- 脚本路径：${data.scriptPath ?? '未指定'}`,
        `- 场景文件：${scene.scenePath ?? '未识别'}`,
        '',
        '## 场景对象',
        '',
        `- 车辆数量：${scene.vehicles.length}`,
        `- 传感器数量：${scene.sensors.length}`,
        `- 障碍物/行人数量：${scene.obstacles.length}`,
        '',
        ...tableSection(
            ['对象', '类型', '位置', '行号'],
            [
                ...scene.vehicles.map(item => [item.id, item.type, formatPoint(item.position), String(item.line)]),
                ...scene.sensors.map(item => [item.id, `${item.type} @ ${item.vehicleId}`, formatPoint(item.position), String(item.line)]),
                ...scene.obstacles.map(item => [item.id, item.type, formatPoint(item.position), String(item.line)])
            ]
        ),
        '',
        '## 实验参数',
        '',
        ...tableSection(
            ['参数', '取值', '来源行'],
            data.parameters.map(item => [item.name, item.value, String(item.line)])
        ),
        '',
        '## 实验结果',
        '',
        ...tableSection(
            ['指标', '值'],
            resultRows.length > 0
                ? resultRows.map(([name, value]) => [name, stringifyValue(value)])
                : [['结果数据', '未在脚本或输出中识别到 HUTB_RESULT JSON']]
        ),
        ''
    ].join('\n');
}

export function buildDocxDocumentXml(data: ExperimentReportData): string {
    const rows = [
        paragraph(data.title, 'Title'),
        paragraph(`生成时间：${data.generatedAt}`),
        paragraph(`脚本路径：${data.scriptPath ?? '未指定'}`),
        paragraph(`场景文件：${data.scene.scenePath ?? '未识别'}`),
        paragraph('场景对象', 'Heading1'),
        tableXml(
            ['对象', '类型', '位置', '行号'],
            [
                ...data.scene.vehicles.map(item => [item.id, item.type, formatPoint(item.position), String(item.line)]),
                ...data.scene.sensors.map(item => [item.id, `${item.type} @ ${item.vehicleId}`, formatPoint(item.position), String(item.line)]),
                ...data.scene.obstacles.map(item => [item.id, item.type, formatPoint(item.position), String(item.line)])
            ]
        ),
        paragraph('实验参数', 'Heading1'),
        tableXml(
            ['参数', '取值', '来源行'],
            data.parameters.map(item => [item.name, item.value, String(item.line)])
        ),
        paragraph('实验结果', 'Heading1'),
        tableXml(
            ['指标', '值'],
            Object.entries(data.resultSummary).length > 0
                ? Object.entries(data.resultSummary).map(([name, value]) => [name, stringifyValue(value)])
                : [['结果数据', '未在脚本或输出中识别到 HUTB_RESULT JSON']]
        )
    ].join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${rows}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
}

export class HutbExperimentReportGenerator {
    private readonly context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async generateFromActiveDocument() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python') {
            vscode.window.showWarningMessage('请先打开一个 Python 仿真实验脚本。');
            return;
        }

        const defaultFormat = vscode.workspace.getConfiguration('hutb.report').get<string>('defaultFormat', 'markdown');
        const formatItems = [
            { label: 'Markdown', description: '生成 .md 实验报告', format: 'markdown' },
            { label: 'Word', description: '生成 .docx 实验报告', format: 'docx' }
        ].sort(item => item.format === defaultFormat ? -1 : 1);
        const selected = await vscode.window.showQuickPick(
            formatItems,
            { placeHolder: '选择实验报告导出格式' }
        );
        if (!selected) {
            return;
        }
        const format = selected.format;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const outputDir = this.resolveOutputDir(workspaceRoot);
        await fs.promises.mkdir(outputDir, { recursive: true });

        const data = createExperimentReportData(editor.document.getText(), editor.document.uri.fsPath);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(outputDir, `hutb-experiment-report-${stamp}.${format === 'docx' ? 'docx' : 'md'}`);

        if (format === 'docx') {
            await writeDocxReport(filePath, data);
        } else {
            await fs.promises.writeFile(filePath, buildMarkdownReport(data), 'utf8');
        }

        vscode.window.showInformationMessage(
            `HUTB 仿真实验报告已生成：${filePath}`,
            '打开报告'
        ).then(result => {
            if (result === '打开报告') {
                vscode.env.openExternal(vscode.Uri.file(filePath));
            }
        });
    }

    private resolveOutputDir(workspaceRoot: string | undefined): string {
        const configured = vscode.workspace.getConfiguration('hutb.report').get<string>('outputDir', '');
        if (configured) {
            return path.normalize(configured.replace(/\$\{workspaceFolder\}/g, workspaceRoot ?? this.context.extensionPath));
        }
        return path.join(workspaceRoot ?? this.context.extensionPath, 'hutb-reports');
    }
}

async function writeDocxReport(filePath: string, data: ExperimentReportData): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const archiver = require('archiver');
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (error: Error) => reject(error));
        archive.pipe(output);
        archive.append(contentTypesXml(), { name: '[Content_Types].xml' });
        archive.append(rootRelsXml(), { name: '_rels/.rels' });
        archive.append(buildDocxDocumentXml(data), { name: 'word/document.xml' });
        archive.append(stylesXml(), { name: 'word/styles.xml' });
        archive.finalize();
    });
}

function tableSection(headers: string[], rows: string[][]): string[] {
    const safeRows = rows.length > 0 ? rows : [['-', '-', '-'].slice(0, headers.length)];
    return [
        `| ${headers.join(' |')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...safeRows.map(row => `| ${row.map(escapeMarkdownCell).join(' | ')} |`)
    ];
}

function tableXml(headers: string[], rows: string[][]): string {
    const safeRows = rows.length > 0 ? rows : [['-', '-', '-'].slice(0, headers.length)];
    return `<w:tbl>
        <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>
        ${rowXml(headers)}
        ${safeRows.map(rowXml).join('')}
    </w:tbl>`;
}

function rowXml(cells: string[]): string {
    return `<w:tr>${cells.map(cell => `<w:tc><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
}

function paragraph(text: string, style?: string): string {
    const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
    return `<w:p>${styleXml}<w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

function formatPoint(point: { x: number; y: number; z: number }): string {
    return `(${point.x}, ${point.y}, ${point.z})`;
}

function stringifyValue(value: unknown): string {
    if (value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    return JSON.stringify(value);
}

function namedValue(raw: string | undefined, label: string): string {
    const value = stringifyValue(parseLiteralValue(raw));
    return value ? `${label}: ${value}` : '';
}

function escapeMarkdownCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function escapeXml(value: string): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function contentTypesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function rootRelsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function stylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`;
}
