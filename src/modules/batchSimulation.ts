import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export interface BatchSimulationCase {
    name: string;
    params: Record<string, unknown>;
    expected?: {
        collision?: boolean;
        maxDurationSeconds?: number;
        maxExitCode?: number;
    };
}

export interface BatchSimulationConfig {
    name: string;
    script: string;
    pythonPath?: string;
    outputDir?: string;
    timeoutMs?: number;
    cases: BatchSimulationCase[];
}

export interface SimulationMetrics {
    collision?: boolean;
    durationSeconds?: number;
    reachedTarget?: boolean;
    failureReason?: string;
    [key: string]: unknown;
}

export interface BatchCaseResult {
    name: string;
    params: Record<string, unknown>;
    passed: boolean;
    exitCode: number | null;
    durationMs: number;
    metrics: SimulationMetrics;
    failureReasons: string[];
    stdout: string;
    stderr: string;
}

export interface BatchSimulationReport {
    name: string;
    script: string;
    startedAt: string;
    finishedAt: string;
    total: number;
    passed: number;
    failed: number;
    cases: BatchCaseResult[];
}

export function createDefaultBatchConfig(): BatchSimulationConfig {
    return {
        name: 'HUTB 批量仿真验证',
        script: '${workspaceFolder}/samples/batch_simulation_case.py',
        pythonPath: 'python',
        outputDir: '${workspaceFolder}/hutb-reports',
        timeoutMs: 60000,
        cases: [
            {
                name: 'urban_speed_30',
                params: { scene: '/scenes/urban_road.scene', speed: 30, weather: 'clear' },
                expected: { collision: false, maxDurationSeconds: 30, maxExitCode: 0 }
            },
            {
                name: 'urban_speed_50_rain',
                params: { scene: '/scenes/urban_road.scene', speed: 50, weather: 'rain' },
                expected: { collision: false, maxDurationSeconds: 35, maxExitCode: 0 }
            },
            {
                name: 'highway_speed_80',
                params: { scene: '/scenes/highway.scene', speed: 80, weather: 'clear' },
                expected: { collision: false, maxDurationSeconds: 45, maxExitCode: 0 }
            }
        ]
    };
}

export function parseBatchConfig(content: string): BatchSimulationConfig {
    const config = JSON.parse(content) as BatchSimulationConfig;
    if (!config.name || !config.script || !Array.isArray(config.cases) || config.cases.length === 0) {
        throw new Error('批量测试配置必须包含 name、script 和非空 cases。');
    }

    for (const testCase of config.cases) {
        if (!testCase.name || typeof testCase.params !== 'object' || testCase.params === null) {
            throw new Error('每个测试用例必须包含 name 和 params。');
        }
    }

    return config;
}

export function resolveConfigPathValue(value: string | undefined, workspaceRoot: string): string | undefined {
    if (!value) {
        return undefined;
    }
    return path.normalize(value.replace(/\$\{workspaceFolder\}/g, workspaceRoot));
}

export function buildCaseEnvironment(testCase: BatchSimulationCase): NodeJS.ProcessEnv {
    return {
        ...process.env,
        HUTB_BATCH_CASE: testCase.name,
        HUTB_BATCH_PARAMS: JSON.stringify(testCase.params)
    };
}

export function extractSimulationMetrics(stdout: string): SimulationMetrics {
    const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const payload = line.startsWith('HUTB_RESULT:')
            ? line.slice('HUTB_RESULT:'.length).trim()
            : line;
        try {
            const parsed = JSON.parse(payload);
            if (typeof parsed === 'object' && parsed !== null) {
                return parsed as SimulationMetrics;
            }
        } catch {
            // Continue searching earlier lines.
        }
    }
    return {};
}

export function evaluateCaseResult(
    testCase: BatchSimulationCase,
    exitCode: number | null,
    metrics: SimulationMetrics
): { passed: boolean; failureReasons: string[] } {
    const failureReasons: string[] = [];
    const expected = testCase.expected ?? {};
    const maxExitCode = expected.maxExitCode ?? 0;

    if (exitCode === null) {
        failureReasons.push('仿真进程被超时终止');
    } else if (exitCode > maxExitCode) {
        failureReasons.push(`退出码 ${exitCode} 超出允许值 ${maxExitCode}`);
    }

    if (expected.collision !== undefined && metrics.collision !== expected.collision) {
        failureReasons.push(`碰撞结果不符合预期：期望 ${expected.collision}，实际 ${metrics.collision}`);
    }

    if (
        expected.maxDurationSeconds !== undefined &&
        typeof metrics.durationSeconds === 'number' &&
        metrics.durationSeconds > expected.maxDurationSeconds
    ) {
        failureReasons.push(`到达目标耗时 ${metrics.durationSeconds}s 超出 ${expected.maxDurationSeconds}s`);
    }

    if (metrics.failureReason) {
        failureReasons.push(String(metrics.failureReason));
    }

    return { passed: failureReasons.length === 0, failureReasons };
}

export function generateHtmlReport(report: BatchSimulationReport): string {
    const rows = report.cases.map(result => {
        const status = result.passed ? '通过' : '失败';
        const statusClass = result.passed ? 'pass' : 'fail';
        return `<tr>
            <td>${escapeHtml(result.name)}</td>
            <td class="${statusClass}">${status}</td>
            <td>${result.exitCode ?? 'timeout'}</td>
            <td>${(result.durationMs / 1000).toFixed(2)}s</td>
            <td><pre>${escapeHtml(JSON.stringify(result.params, null, 2))}</pre></td>
            <td><pre>${escapeHtml(JSON.stringify(result.metrics, null, 2))}</pre></td>
            <td>${escapeHtml(result.failureReasons.join('; ') || '-')}</td>
        </tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(report.name)} - HUTB 批量仿真报告</title>
    <style>
        body { font-family: "Microsoft YaHei", Arial, sans-serif; margin: 24px; color: #1f2933; background: #f7f9fb; }
        h1 { margin-bottom: 4px; }
        .summary { display: flex; gap: 12px; margin: 20px 0; }
        .card { background: #fff; border: 1px solid #d8e2ec; border-radius: 8px; padding: 14px 18px; min-width: 120px; }
        .value { font-size: 28px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; background: #fff; }
        th, td { border: 1px solid #d8e2ec; padding: 10px; vertical-align: top; text-align: left; }
        th { background: #e6f0f8; }
        pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
        .pass { color: #0b7a3b; font-weight: 700; }
        .fail { color: #b42318; font-weight: 700; }
    </style>
</head>
<body>
    <h1>${escapeHtml(report.name)}</h1>
    <div>脚本：${escapeHtml(report.script)}</div>
    <div>时间：${escapeHtml(report.startedAt)} - ${escapeHtml(report.finishedAt)}</div>
    <div class="summary">
        <div class="card"><div>总用例</div><div class="value">${report.total}</div></div>
        <div class="card"><div>通过</div><div class="value pass">${report.passed}</div></div>
        <div class="card"><div>失败</div><div class="value fail">${report.failed}</div></div>
    </div>
    <table>
        <thead>
            <tr>
                <th>测试用例</th>
                <th>结果</th>
                <th>退出码</th>
                <th>耗时</th>
                <th>参数</th>
                <th>指标</th>
                <th>失败原因</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>
</body>
</html>`;
}

export class HutbBatchSimulationRunner {
    constructor(_context: vscode.ExtensionContext) {}

    public async createConfigFile(targetUri?: vscode.Uri) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const targetDir = targetUri?.fsPath
            ? (await vscode.workspace.fs.stat(targetUri)).type === vscode.FileType.Directory
                ? targetUri.fsPath
                : path.dirname(targetUri.fsPath)
            : workspaceRoot;

        if (!targetDir) {
            vscode.window.showWarningMessage('请先打开工作区或在资源管理器中选择目录。');
            return;
        }

        const target = vscode.Uri.file(path.join(targetDir, 'hutb-batch-test.json'));
        await vscode.workspace.fs.writeFile(
            target,
            Buffer.from(JSON.stringify(createDefaultBatchConfig(), null, 2), 'utf8')
        );
        const document = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(document);
        vscode.window.showInformationMessage(`已创建批量仿真测试配置：${target.fsPath}`);
    }

    public async runFromCommand(configUri?: vscode.Uri) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showWarningMessage('请先打开一个工作区。');
            return;
        }

        const targetUri = configUri ?? await this.pickConfigFile();
        if (!targetUri) {
            return;
        }

        const reportPath = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'HUTB 批量仿真测试',
                cancellable: false
            },
            async progress => {
                progress.report({ message: '读取测试配置...' });
                const config = parseBatchConfig(await fs.promises.readFile(targetUri.fsPath, 'utf8'));
                const report = await this.runConfig(config, workspaceRoot, message => {
                    progress.report({ message });
                });
                return this.writeReport(config, report, workspaceRoot);
            }
        );

        vscode.window.showInformationMessage(
            `HUTB 批量测试报告已生成：${reportPath}`,
            '打开报告'
        ).then(result => {
            if (result === '打开报告') {
                vscode.env.openExternal(vscode.Uri.file(reportPath));
            }
        });
    }

    public async runConfig(
        config: BatchSimulationConfig,
        workspaceRoot: string,
        onProgress?: (message: string) => void
    ): Promise<BatchSimulationReport> {
        const script = resolveConfigPathValue(config.script, workspaceRoot) ?? config.script;
        const pythonPath = config.pythonPath || vscode.workspace.getConfiguration('hutb').get<string>('pythonPath') || 'python';
        const startedAt = new Date().toISOString();
        const results: BatchCaseResult[] = [];

        for (let i = 0; i < config.cases.length; i++) {
            const testCase = config.cases[i];
            onProgress?.(`运行 ${i + 1}/${config.cases.length}: ${testCase.name}`);
            const timeoutMs = config.timeoutMs
                ?? vscode.workspace.getConfiguration('hutb.batch').get<number>('defaultTimeoutMs', 60000);
            results.push(await this.runCase(pythonPath, script, testCase, workspaceRoot, timeoutMs));
        }

        const passed = results.filter(result => result.passed).length;
        return {
            name: config.name,
            script,
            startedAt,
            finishedAt: new Date().toISOString(),
            total: results.length,
            passed,
            failed: results.length - passed,
            cases: results
        };
    }

    private async runCase(
        pythonPath: string,
        script: string,
        testCase: BatchSimulationCase,
        cwd: string,
        timeoutMs: number
    ): Promise<BatchCaseResult> {
        const started = Date.now();
        const processResult = await runProcess(pythonPath, [script], {
            cwd,
            env: buildCaseEnvironment(testCase),
            timeoutMs
        });
        const metrics = extractSimulationMetrics(processResult.stdout);
        const evaluated = evaluateCaseResult(testCase, processResult.exitCode, metrics);

        return {
            name: testCase.name,
            params: testCase.params,
            passed: evaluated.passed,
            exitCode: processResult.exitCode,
            durationMs: Date.now() - started,
            metrics,
            failureReasons: evaluated.failureReasons,
            stdout: processResult.stdout,
            stderr: processResult.stderr
        };
    }

    private async writeReport(
        config: BatchSimulationConfig,
        report: BatchSimulationReport,
        workspaceRoot: string
    ): Promise<string> {
        const configuredOutputDir = vscode.workspace.getConfiguration('hutb.batch').get<string>('reportOutputDir', '');
        const outputDir = resolveConfigPathValue(config.outputDir || configuredOutputDir, workspaceRoot)
            ?? path.join(workspaceRoot, 'hutb-reports');
        await fs.promises.mkdir(outputDir, { recursive: true });
        const reportPath = path.join(outputDir, `hutb-report-${Date.now()}.html`);
        await fs.promises.writeFile(reportPath, generateHtmlReport(report), 'utf8');
        return reportPath;
    }

    private async pickConfigFile(): Promise<vscode.Uri | undefined> {
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { JSON: ['json'] },
            openLabel: '选择批量仿真测试配置'
        });
        return selected?.[0];
    }
}

interface ProcessRunOptions {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
}

interface ProcessRunResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
}

function runProcess(command: string, args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
    return new Promise(resolve => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            shell: process.platform === 'win32'
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, options.timeoutMs);

        child.stdout.on('data', chunk => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });
        child.on('close', code => {
            clearTimeout(timer);
            resolve({ exitCode: timedOut ? null : code, stdout, stderr });
        });
        child.on('error', error => {
            clearTimeout(timer);
            resolve({ exitCode: 1, stdout, stderr: `${stderr}\n${error.message}` });
        });
    });
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
