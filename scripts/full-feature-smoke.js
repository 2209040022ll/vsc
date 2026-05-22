const fs = require('fs');
const path = require('path');
const http = require('http');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.feature-smoke');
const generatedDir = path.join(outputDir, 'generated-scripts');
const reportsDir = path.join(outputDir, 'reports');
const apiDefs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'api-definitions.json'), 'utf8'));
const runtimeConfig = {
  hotReloadEndpoint: 'http://127.0.0.1:0/hutb/hot-reload'
};

fs.mkdirSync(generatedDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class Range {
  constructor(start, endOrStartCharacter, endLine, endCharacter) {
    if (typeof endOrStartCharacter === 'number') {
      this.start = new Position(start, endOrStartCharacter);
      this.end = new Position(endLine, endCharacter);
    } else {
      this.start = start;
      this.end = endOrStartCharacter;
    }
  }
}

class CompletionItem {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
  }
}

class SnippetString {
  constructor(value) {
    this.value = value;
  }
}

class MarkdownString {
  constructor(value = '') {
    this.value = value;
    this.isTrusted = false;
  }
  appendMarkdown(value) {
    this.value += value;
    return this;
  }
  appendCodeblock(code, language = '') {
    this.value += `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
    return this;
  }
}

class Diagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
}

class CodeAction {
  constructor(title, kind) {
    this.title = title;
    this.kind = kind;
  }
}

class WorkspaceEdit {
  constructor() {
    this.edits = [];
  }
  replace(uri, range, text) {
    this.edits.push({ uri, range, text });
  }
}

class Hover {
  constructor(contents, range) {
    this.contents = contents;
    this.range = range;
  }
}

class SignatureHelp {
  constructor() {
    this.signatures = [];
    this.activeSignature = 0;
    this.activeParameter = 0;
  }
}

class SignatureInformation {
  constructor(label, documentation) {
    this.label = label;
    this.documentation = documentation;
    this.parameters = [];
  }
}

class ParameterInformation {
  constructor(label, documentation) {
    this.label = label;
    this.documentation = documentation;
  }
}

const mockVscode = {
  CompletionItem,
  CompletionItemKind: { Function: 3, Method: 2, Property: 9, Class: 6 },
  CompletionItemTag: { Deprecated: 1 },
  SnippetString,
  MarkdownString,
  Diagnostic,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Range,
  Position,
  CodeAction,
  CodeActionKind: { QuickFix: 'quickfix' },
  CodeActionTriggerKind: { Invoke: 1 },
  WorkspaceEdit,
  Hover,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  Uri: {
    file(filePath) {
      return { fsPath: filePath };
    }
  },
  FileType: { File: 1, Directory: 2 },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: root } }],
    getConfiguration(section) {
      return {
        get(key, fallback) {
          if (section === 'hutb.hotReload' && key === 'enabled') {
            return true;
          }
          if (section === 'hutb.hotReload' && key === 'mcpEndpoint') {
            return runtimeConfig.hotReloadEndpoint;
          }
          if (section === 'hutb.hotReload' && key === 'timeoutMs') {
            return 3000;
          }
          if (section === 'hutb.batch' && key === 'defaultTimeoutMs') {
            return 10000;
          }
          if (section === 'hutb.batch' && key === 'reportOutputDir') {
            return reportsDir;
          }
          return fallback;
        }
      };
    }
  },
  window: {
    showWarningMessage() {},
    showInformationMessage() {}
  }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { HutbCompletionProvider } = require('../out/modules/completion');
const { HutbHoverProvider, HutbSignatureHelpProvider } = require('../out/modules/apiHelp');
const { HutbCodeActionProvider, HutbDiagnosticProvider } = require('../out/modules/diagnostics');
const { HutbHotReloadManager } = require('../out/modules/hotReload');
const { HutbSimulationMonitorProvider } = require('../out/modules/simulationMonitor');
const {
  BUILTIN_SIMULATION_TEMPLATES,
  sanitizePythonFileName
} = require('../out/modules/scriptTemplates');
const {
  HutbBatchSimulationRunner,
  createDefaultBatchConfig,
  generateHtmlReport
} = require('../out/modules/batchSimulation');

function makeDocument(content, languageId = 'python') {
  const lineStarts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }
  function offsetAt(position) {
    return lineStarts[position.line] + position.character;
  }
  function positionAt(offset) {
    let line = 0;
    for (let i = 0; i < lineStarts.length; i++) {
      if (lineStarts[i] <= offset) {
        line = i;
      } else {
        break;
      }
    }
    return new Position(line, offset - lineStarts[line]);
  }
  return {
    languageId,
    uri: { fsPath: path.join(outputDir, 'virtual.py') },
    getText(range) {
      if (!range) {
        return content;
      }
      return content.slice(offsetAt(range.start), offsetAt(range.end));
    },
    positionAt,
    offsetAt,
    lineAt(lineOrPosition) {
      const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
      const start = lineStarts[line];
      const end = line + 1 < lineStarts.length ? lineStarts[line + 1] - 1 : content.length;
      return { text: content.slice(start, end) };
    },
    getWordRangeAtPosition(position) {
      const line = this.lineAt(position.line).text;
      let start = position.character;
      let end = position.character;
      while (start > 0 && /\w/.test(line[start - 1])) {
        start--;
      }
      while (end < line.length && /\w/.test(line[end])) {
        end++;
      }
      return new Range(new Position(position.line, start), new Position(position.line, end));
    }
  };
}

function makeDiagnosticCollection() {
  const map = new Map();
  return {
    set(uri, diagnostics) {
      map.set(uri.fsPath || 'virtual', diagnostics);
    },
    get(uri) {
      return map.get(uri.fsPath || 'virtual') || [];
    }
  };
}

async function runCheck(results, name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    const durationMs = Date.now() - started;
    results.push({ name, status: 'PASS', durationMs, detail });
    console.log(`[PASS] ${name}`);
    if (detail) {
      console.log(`       ${detail}`);
    }
  } catch (error) {
    const durationMs = Date.now() - started;
    results.push({
      name,
      status: 'FAIL',
      durationMs,
      detail: error && error.stack ? error.stack : String(error)
    });
    console.log(`[FAIL] ${name}`);
    console.log(`       ${error && error.stack ? error.stack : error}`);
    process.exitCode = 1;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function labelOf(item) {
  return typeof item.label === 'string' ? item.label : item.label.label;
}

function startMockMcpServer() {
  let received = null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      received = {
        method: req.method,
        url: req.url,
        body: JSON.parse(body)
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        endpoint: `http://127.0.0.1:${address.port}/hutb/hot-reload`,
        close: () => new Promise(done => server.close(done)),
        getReceived: () => received
      });
    });
  });
}

function writeFeatureReport(results, artifacts) {
  const passCount = results.filter(item => item.status === 'PASS').length;
  const failCount = results.length - passCount;
  const rows = results.map(item => `<tr>
    <td>${escapeHtml(item.name)}</td>
    <td class="${item.status === 'PASS' ? 'pass' : 'fail'}">${item.status}</td>
    <td>${item.durationMs} ms</td>
    <td><pre>${escapeHtml(item.detail || '')}</pre></td>
  </tr>`).join('\n');
  const artifactRows = artifacts.map(item => `<li><code>${escapeHtml(item)}</code></li>`).join('\n');
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>HUTB 插件完整功能验收报告</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; margin: 24px; color: #1f2933; background: #f7f9fb; }
    .summary { display: flex; gap: 12px; margin: 18px 0; }
    .card { background: #fff; border: 1px solid #d8e2ec; border-radius: 8px; padding: 14px 18px; min-width: 130px; }
    .value { font-size: 28px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #d8e2ec; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #e6f0f8; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
    .pass { color: #0b7a3b; font-weight: 700; }
    .fail { color: #b42318; font-weight: 700; }
  </style>
</head>
<body>
  <h1>HUTB 插件完整功能验收报告</h1>
  <div>生成时间：${new Date().toISOString()}</div>
  <div class="summary">
    <div class="card"><div>总项</div><div class="value">${results.length}</div></div>
    <div class="card"><div>通过</div><div class="value pass">${passCount}</div></div>
    <div class="card"><div>失败</div><div class="value fail">${failCount}</div></div>
  </div>
  <h2>功能结果</h2>
  <table>
    <thead><tr><th>功能</th><th>结果</th><th>耗时</th><th>细节</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>生成文件</h2>
  <ul>${artifactRows}</ul>
</body>
</html>`;
  const reportPath = path.join(outputDir, 'feature-smoke-report.html');
  fs.writeFileSync(reportPath, html, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'feature-smoke-summary.json'), JSON.stringify({ results, artifacts }, null, 2), 'utf8');
  return reportPath;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function main() {
  const results = [];
  const artifacts = [];

  await runCheck(results, '项目清单与贡献点', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const commands = new Set(pkg.contributes.commands.map(command => command.command));
    [
      'hutb.openSimulationMonitor',
      'hutb.newSimulationScript',
      'hutb.createBatchTestConfig',
      'hutb.runBatchSimulationTests',
      'hutb.exportTelemetryCsv'
    ].forEach(command => assert(commands.has(command), `缺少命令 ${command}`));
    assert(pkg.contributes.views.explorer.some(view => view.id === 'hutb.simulationMonitor'), '缺少仿真监控视图');
    return `命令数=${commands.size}，已注册仿真监控视图和右键菜单`;
  });

  await runCheck(results, 'HUTB/MCP 代码补全', () => {
    const provider = new HutbCompletionProvider(apiDefs);
    const hutbItems = provider.provideCompletionItems(makeDocument('import hutb\nhutb.'), new Position(1, 5), {}, {}) || [];
    const mcpItems = provider.provideCompletionItems(makeDocument('import mcp\nmcp.'), new Position(1, 4), {}, {}) || [];
    const hutbNames = hutbItems.map(labelOf);
    const mcpNames = mcpItems.map(labelOf);
    assert(hutbNames.includes('init_simulator'), 'HUTB 补全缺少 init_simulator');
    assert(hutbNames.includes('create_vehicle'), 'HUTB 补全缺少 create_vehicle');
    assert(mcpNames.includes('connect'), 'MCP 补全缺少 connect');
    assert(mcpNames.includes('send_message'), 'MCP 补全缺少 send_message');
    return `HUTB补全=${hutbItems.length}项，MCP补全=${mcpItems.length}项`;
  });

  await runCheck(results, '签名帮助与悬停文档', () => {
    const signatureProvider = new HutbSignatureHelpProvider(apiDefs);
    const signatureDoc = makeDocument('import hutb\nhutb.set_vehicle_speed(');
    const signature = signatureProvider.provideSignatureHelp(signatureDoc, new Position(1, 23));
    assert(signature && signature.signatures.length === 1, '签名帮助未返回结果');
    assert(signature.signatures[0].label.includes('set_vehicle_speed'), '签名内容不正确');

    const hoverProvider = new HutbHoverProvider(apiDefs);
    const hoverDoc = makeDocument('import hutb\nhutb.set_vehicle_speed(car, speed=50)');
    const hover = hoverProvider.provideHover(hoverDoc, new Position(1, 10));
    assert(hover && hover.contents.value.includes('set_vehicle_speed'), '悬停文档未返回函数说明');
    return signature.signatures[0].label;
  });

  await runCheck(results, '仿真脚本专属静态错误检测', () => {
    const diagnosticProvider = new HutbDiagnosticProvider(apiDefs);
    const collection = makeDiagnosticCollection();
    diagnosticProvider.setDiagnosticCollection(collection);
    const code = [
      'import hutb',
      'car = hutb.create_vehicle("sedan", (0, 0, 0))',
      'hutb.set_vehicle_speed(car, speed=1000)',
      'sensor = hutb.init_sensor(car, "lidar")'
    ].join('\n');
    const doc = makeDocument(code);
    diagnosticProvider.analyze(doc);
    const diagnostics = collection.get(doc.uri);
    const codes = diagnostics.map(item => item.code);
    assert(codes.includes('simulation-init-order'), '缺少初始化顺序检测');
    assert(codes.includes('parameter-out-of-range'), '缺少参数越界检测');
    assert(codes.includes('deprecated-function'), '缺少弃用 API 检测');

    const actionProvider = new HutbCodeActionProvider(apiDefs);
    const deprecated = diagnostics.find(item => item.code === 'deprecated-function');
    const actions = actionProvider.provideCodeActions(doc, deprecated.range, {
      diagnostics: [deprecated],
      only: mockVscode.CodeActionKind.QuickFix,
      triggerKind: mockVscode.CodeActionTriggerKind.Invoke
    });
    assert(actions.length > 0 && actions[0].title.includes('add_sensor'), '弃用 API 快速修复失败');
    return `诊断数=${diagnostics.length}，诊断代码=${codes.join(', ')}`;
  });

  await runCheck(results, '仿真参数热重载到 MCP 网关', async () => {
    const server = await startMockMcpServer();
    runtimeConfig.hotReloadEndpoint = server.endpoint;
    try {
      const statusEvents = [];
      const manager = new HutbHotReloadManager({
        showHotReloadResult(success, message) {
          statusEvents.push({ success, message });
        }
      });
      const doc = makeDocument([
        'import hutb',
        'hutb.set_vehicle_speed(car, speed=55)',
        'hutb.update_sensor_params(camera, sample_rate=30, fov=90)'
      ].join('\n'));
      await manager.handleSavedDocument(doc);
      const received = server.getReceived();
      assert(received && received.body.command === 'hot_reload', 'MCP 网关未收到 hot_reload');
      assert(statusEvents.some(event => event.success), '状态栏未收到成功结果');
      return `MCP topic=${received.body.topic}，payload=${JSON.stringify(received.body.payload)}`;
    } finally {
      await server.close();
    }
  });

  await runCheck(results, '仿真监控数据可视化输入与 CSV 导出', () => {
    const sample = HutbSimulationMonitorProvider.normalizeTelemetry({
      vehicle_id: 'ego',
      position: { x: 12.5, y: -3.2 },
      speed: 48,
      accel: 1.2,
      steer: 0.12,
      sensors: {
        camera: { frames: 12 },
        lidar: { points: 22000 }
      }
    });
    const csv = HutbSimulationMonitorProvider.toCsv([sample]);
    const csvPath = path.join(outputDir, 'monitor-telemetry.csv');
    fs.writeFileSync(csvPath, csv, 'utf8');
    artifacts.push(csvPath);
    assert(csv.includes('ego') && csv.includes('22000'), 'CSV 内容缺少车辆或雷达数据');
    return `CSV=${csvPath}`;
  });

  await runCheck(results, '常用仿真场景模板生成', () => {
    assert(BUILTIN_SIMULATION_TEMPLATES.length === 3, '内置模板数量不是 3');
    const generated = [];
    for (const template of BUILTIN_SIMULATION_TEMPLATES) {
      assert(template.content.includes('hutb.init_simulator'), `${template.label} 缺少初始化代码`);
      const fileName = sanitizePythonFileName(template.defaultFileName);
      const filePath = path.join(generatedDir, fileName);
      fs.writeFileSync(filePath, template.content, 'utf8');
      generated.push(fileName);
      artifacts.push(filePath);
    }
    return `已生成模板脚本：${generated.join(', ')}`;
  });

  await runCheck(results, '批量仿真测试与 HTML 报告', async () => {
    const config = createDefaultBatchConfig();
    config.script = path.join(root, 'samples', 'batch_simulation_case.py');
    config.pythonPath = process.env.PYTHON || 'python';
    config.outputDir = reportsDir;
    config.timeoutMs = 10000;
    const runner = new HutbBatchSimulationRunner({});
    const report = await runner.runConfig(config, root);
    assert(report.total === 3, '批量测试用例数量不正确');
    assert(report.passed === 3, `批量测试未全部通过：failed=${report.failed}`);
    const reportHtml = generateHtmlReport(report);
    const reportPath = path.join(reportsDir, 'batch-simulation-report.html');
    fs.writeFileSync(reportPath, reportHtml, 'utf8');
    artifacts.push(reportPath);
    return `用例=${report.total}，通过=${report.passed}，报告=${reportPath}`;
  });

  await runCheck(results, '打包产物关键文件检查', () => {
    const required = [
      'out/extension.js',
      'out/modules/hotReload.js',
      'out/modules/simulationMonitor.js',
      'out/modules/scriptTemplates.js',
      'out/modules/batchSimulation.js',
      'resources/icon.png',
      'samples/hutb-batch-test.json'
    ];
    for (const relativePath of required) {
      assert(fs.existsSync(path.join(root, relativePath)), `缺少 ${relativePath}`);
    }
    const vsixPath = path.join(root, 'hutb-simulator-dev-0.1.0.vsix');
    if (fs.existsSync(vsixPath)) {
      artifacts.push(vsixPath);
      return `关键运行文件存在，VSIX=${vsixPath}`;
    }
    return '关键运行文件存在，VSIX 尚未生成';
  });

  const reportPath = writeFeatureReport(results, artifacts);
  console.log('');
  console.log('========================================');
  console.log(`完整功能验收报告: ${reportPath}`);
  console.log(`结果摘要 JSON: ${path.join(outputDir, 'feature-smoke-summary.json')}`);
  console.log('生成文件目录: ' + outputDir);
  console.log('========================================');

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
