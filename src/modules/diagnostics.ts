import * as vscode from 'vscode';
import { ApiDefinitions, ApiFunction } from '../utils/apiLoader';
import {
    PythonCall,
    countArguments,
    findApiCalls,
    parseArguments,
    readIdentifierArgument,
    readNumericArgument
} from '../utils/pythonCallParser';

type EntityKind = 'simulator' | 'scene' | 'vehicle' | 'sensor';

interface EntityDefinition {
    kind: EntityKind;
    line: number;
}

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
        const calls = findApiCalls(text);
        const entities = new Map<string, EntityDefinition>();
        let simulatorInitialized = false;

        for (const call of calls) {
            const range = this.rangeFromOffsets(document, call.startOffset, call.endOffset);
            const funcNameRange = this.rangeFromOffsets(
                document,
                call.funcNameStartOffset,
                call.funcNameEndOffset
            );

            const funcDef = this.allFunctions.get(call.fullName);

            if (!funcDef) {
                // 检查是否为模块中的未知函数（可能是拼写错误）
                const suggestion = this.findSimilarFunction(call.moduleName, call.funcName);
                const message = suggestion
                    ? `未知函数 '${call.fullName}'，您是否想使用 '${suggestion}'？`
                    : `未知函数 '${call.fullName}'，该函数未在 API 定义中找到。`;

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
                const message = `'${call.fullName}' 已弃用，请使用 '${call.moduleName}.${funcDef.replacement}' 代替。`;
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
            const argCount = countArguments(call.argsText);

            if (argCount < requiredParams.length) {
                const message = `'${call.fullName}' 需要至少 ${requiredParams.length} 个必填参数，但只提供了 ${argCount} 个。\n必填参数: ${requiredParams.map(p => p.name).join(', ')}`;
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
                const message = `'${call.fullName}' 最多接受 ${funcDef.params.length} 个参数，但提供了 ${argCount} 个。`;
                const diagnostic = new vscode.Diagnostic(
                    range,
                    message,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = 'HUTB';
                diagnostic.code = 'too-many-arguments';
                diagnostics.push(diagnostic);
            }

            if (call.moduleName === 'hutb') {
                this.analyzeSimulationSemantics(
                    document,
                    call,
                    entities,
                    simulatorInitialized,
                    diagnostics
                );

                if (call.funcName === 'init_simulator') {
                    simulatorInitialized = true;
                    this.registerEntity(document, call, 'simulator', entities, diagnostics);
                } else if (call.funcName === 'load_scene') {
                    this.registerEntity(document, call, 'scene', entities, diagnostics);
                } else if (call.funcName === 'create_vehicle') {
                    this.registerEntity(document, call, 'vehicle', entities, diagnostics);
                } else if (call.funcName === 'add_sensor') {
                    this.registerEntity(document, call, 'sensor', entities, diagnostics);
                }
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
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

    private analyzeSimulationSemantics(
        document: vscode.TextDocument,
        call: PythonCall,
        entities: Map<string, EntityDefinition>,
        simulatorInitialized: boolean,
        diagnostics: vscode.Diagnostic[]
    ) {
        const range = this.rangeFromOffsets(document, call.startOffset, call.endOffset);

        if (this.requiresInitializedSimulator(call.funcName) && !simulatorInitialized) {
            const diagnostic = new vscode.Diagnostic(
                range,
                `'${call.fullName}' 在仿真逻辑上需要先调用 hutb.init_simulator()，否则车辆/场景对象可能尚未接入仿真引擎。`,
                vscode.DiagnosticSeverity.Error
            );
            diagnostic.source = 'HUTB';
            diagnostic.code = 'simulation-init-order';
            diagnostics.push(diagnostic);
        }

        this.checkEntityReferences(document, call, entities, diagnostics);
        this.checkParameterRanges(document, call, diagnostics);
    }

    private requiresInitializedSimulator(funcName: string): boolean {
        return [
            'load_scene',
            'create_vehicle',
            'add_sensor',
            'start_simulation',
            'step',
            'set_weather',
            'set_vehicle_control',
            'set_vehicle_speed',
            'update_sensor_params',
            'update_scene_lighting'
        ].includes(funcName);
    }

    private registerEntity(
        document: vscode.TextDocument,
        call: PythonCall,
        kind: EntityKind,
        entities: Map<string, EntityDefinition>,
        diagnostics: vscode.Diagnostic[]
    ) {
        if (!call.assignedTo) {
            return;
        }

        const existing = entities.get(call.assignedTo);
        if (existing) {
            const range = this.rangeFromOffsets(
                document,
                call.startOffset,
                call.startOffset + call.assignedTo.length
            );
            const diagnostic = new vscode.Diagnostic(
                range,
                `仿真对象 '${call.assignedTo}' 已在第 ${existing.line + 1} 行定义为 ${this.kindLabel(existing.kind)}，重复定义会导致车辆/场景/传感器 ID 追踪混乱。`,
                vscode.DiagnosticSeverity.Warning
            );
            diagnostic.source = 'HUTB';
            diagnostic.code = 'duplicate-simulation-entity';
            diagnostics.push(diagnostic);
            return;
        }

        entities.set(call.assignedTo, { kind, line: call.line });
    }

    private checkEntityReferences(
        document: vscode.TextDocument,
        call: PythonCall,
        entities: Map<string, EntityDefinition>,
        diagnostics: vscode.Diagnostic[]
    ) {
        const parsed = parseArguments(call.argsText);
        const expectations: Record<string, { kind: EntityKind; index: number; names: string[] }> = {
            add_sensor: { kind: 'vehicle', index: 0, names: ['vehicle', 'target_vehicle'] },
            get_vehicle_state: { kind: 'vehicle', index: 0, names: ['vehicle'] },
            set_vehicle_control: { kind: 'vehicle', index: 0, names: ['vehicle'] },
            set_vehicle_speed: { kind: 'vehicle', index: 0, names: ['vehicle'] },
            get_collision_info: { kind: 'vehicle', index: 0, names: ['vehicle'] },
            get_sensor_data: { kind: 'sensor', index: 0, names: ['sensor'] },
            update_sensor_params: { kind: 'sensor', index: 0, names: ['sensor'] }
        };
        const expectation = expectations[call.funcName];
        if (!expectation) {
            return;
        }

        const identifier = readIdentifierArgument(parsed, expectation.index, expectation.names);
        if (!identifier) {
            return;
        }

        const entity = entities.get(identifier);
        if (!entity || entity.kind !== expectation.kind) {
            const diagnostic = new vscode.Diagnostic(
                this.rangeFromOffsets(document, call.startOffset, call.endOffset),
                `'${identifier}' 尚未通过 ${this.factoryFunction(expectation.kind)} 创建，可能引用了不存在的 ${this.kindLabel(expectation.kind)} ID。`,
                vscode.DiagnosticSeverity.Error
            );
            diagnostic.source = 'HUTB';
            diagnostic.code = 'unknown-simulation-entity';
            diagnostics.push(diagnostic);
        }
    }

    private checkParameterRanges(
        document: vscode.TextDocument,
        call: PythonCall,
        diagnostics: vscode.Diagnostic[]
    ) {
        const parsed = parseArguments(call.argsText);

        const checks: Array<{ value: number | undefined; min: number; max: number; label: string }> = [];
        switch (call.funcName) {
            case 'set_vehicle_control':
                checks.push(
                    { value: readNumericArgument(parsed, 1, ['throttle']), min: 0, max: 1, label: '油门开度 throttle' },
                    { value: readNumericArgument(parsed, 2, ['brake']), min: 0, max: 1, label: '制动强度 brake' },
                    { value: readNumericArgument(parsed, 3, ['steer']), min: -1, max: 1, label: '方向盘转角 steer' }
                );
                break;
            case 'set_vehicle_speed':
                checks.push({ value: readNumericArgument(parsed, 1, ['speed', 'speed_kmh', 'target_speed']), min: 0, max: 250, label: '车辆目标速度' });
                break;
            case 'update_sensor_params':
                checks.push(
                    { value: readNumericArgument(parsed, 1, ['sample_rate', 'rate', 'frequency', 'fps']), min: 1, max: 240, label: '传感器采样率' },
                    { value: readNumericArgument(parsed, 2, ['fov', 'angle', 'horizontal_fov']), min: 1, max: 180, label: '传感器视场角' }
                );
                break;
            case 'set_weather':
                checks.push({ value: readNumericArgument(parsed, 1, ['intensity']), min: 0, max: 1, label: '天气强度 intensity' });
                break;
            case 'add_pedestrian':
                checks.push({ value: readNumericArgument(parsed, 2, ['speed']), min: 0, max: 12, label: '行人速度' });
                break;
            case 'step':
                checks.push({ value: readNumericArgument(parsed, 0, ['delta_time']), min: 0.001, max: 1, label: '仿真步长 delta_time' });
                break;
        }

        for (const check of checks) {
            if (check.value === undefined) {
                continue;
            }

            if (check.value < check.min || check.value > check.max) {
                const diagnostic = new vscode.Diagnostic(
                    this.rangeFromOffsets(document, call.startOffset, call.endOffset),
                    `${check.label}=${check.value} 超出建议范围 [${check.min}, ${check.max}]，可能造成仿真失真或接口拒绝。`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = 'HUTB';
                diagnostic.code = 'parameter-out-of-range';
                diagnostics.push(diagnostic);
            }
        }
    }

    private kindLabel(kind: EntityKind): string {
        switch (kind) {
            case 'simulator':
                return '模拟器';
            case 'scene':
                return '场景';
            case 'vehicle':
                return '车辆';
            case 'sensor':
                return '传感器';
        }
    }

    private factoryFunction(kind: EntityKind): string {
        switch (kind) {
            case 'simulator':
                return 'hutb.init_simulator()';
            case 'scene':
                return 'hutb.load_scene()';
            case 'vehicle':
                return 'hutb.create_vehicle()';
            case 'sensor':
                return 'hutb.add_sensor()';
        }
    }

    private rangeFromOffsets(document: vscode.TextDocument, start: number, end: number): vscode.Range {
        return new vscode.Range(document.positionAt(start), document.positionAt(end));
    }
}

export class HutbCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];
    private replacementByFunctionName = new Map<string, string>();

    constructor(apiDefs: ApiDefinitions) {
        for (const func of [...apiDefs.hutb.functions, ...apiDefs.mcp.functions]) {
            if (func.deprecated && func.replacement) {
                this.replacementByFunctionName.set(func.name, func.replacement);
            }
        }
    }

    public provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== 'HUTB' || diagnostic.code !== 'deprecated-function') {
                continue;
            }

            const currentName = document.getText(diagnostic.range);
            const replacement = this.replacementByFunctionName.get(currentName);
            if (!replacement) {
                continue;
            }

            const action = new vscode.CodeAction(
                `替换为 ${replacement}`,
                vscode.CodeActionKind.QuickFix
            );
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            action.edit = new vscode.WorkspaceEdit();
            action.edit.replace(document.uri, diagnostic.range, replacement);
            actions.push(action);
        }

        return actions;
    }
}
