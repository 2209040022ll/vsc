import * as vscode from 'vscode';
import * as path from 'path';

export interface SimulationScriptTemplate {
    id: string;
    label: string;
    description: string;
    defaultFileName: string;
    content: string;
    custom?: boolean;
}

const CUSTOM_TEMPLATE_KEY = 'hutb.customSimulationTemplates';

export const BUILTIN_SIMULATION_TEMPLATES: SimulationScriptTemplate[] = [
    {
        id: 'single-vehicle-control',
        label: '基础单车辆控制模板',
        description: '初始化模拟器、加载场景、创建车辆并设置基础控制输入',
        defaultFileName: 'single_vehicle_control.py',
        content: `"""
HUTB 基础单车辆控制模板
用于快速验证单车速度、转向和制动控制。
"""

import hutb


def main():
    sim = hutb.init_simulator(host="localhost", port=8000)
    scene = hutb.load_scene("/scenes/urban_road.scene")
    car = hutb.create_vehicle("sedan", (0, 0, 0), color="blue")

    hutb.start_simulation(realtime=True)
    hutb.set_vehicle_speed(car, speed=50)

    try:
        for _ in range(500):
            state = hutb.get_vehicle_state(car)
            hutb.set_vehicle_control(car, throttle=0.45, brake=0.0, steer=0.0)
            hutb.step(delta_time=0.02)
            print("speed=", state.speed, "position=", state.position)
    finally:
        hutb.stop_simulation()
        hutb.destroy(sim)


if __name__ == "__main__":
    main()
`
    },
    {
        id: 'multi-vehicle-cooperation',
        label: '多车协同场景模板',
        description: '创建主车与跟驰车辆，演示多车状态读取和协同控制',
        defaultFileName: 'multi_vehicle_cooperation.py',
        content: `"""
HUTB 多车协同场景模板
用于快速搭建主车、跟驰车和车队控制验证脚本。
"""

import hutb


def main():
    sim = hutb.init_simulator(host="localhost", port=8000)
    scene = hutb.load_scene("/scenes/highway.scene")

    ego = hutb.create_vehicle("sedan", (0, 0, 0), color="blue")
    follower = hutb.create_vehicle("suv", (-18, 0, 0), color="white")
    observer = hutb.create_vehicle("truck", (-42, 3.5, 0), color="yellow")

    hutb.start_simulation(realtime=True)
    hutb.set_vehicle_speed(ego, speed=60)
    hutb.set_vehicle_speed(follower, speed=55)
    hutb.set_vehicle_speed(observer, speed=48)

    try:
        for _ in range(800):
            ego_state = hutb.get_vehicle_state(ego)
            follower_state = hutb.get_vehicle_state(follower)

            distance = ego_state.position.x - follower_state.position.x
            throttle = 0.55 if distance > 20 else 0.25
            brake = 0.0 if distance > 12 else 0.35
            hutb.set_vehicle_control(follower, throttle=throttle, brake=brake, steer=0.0)
            hutb.step(delta_time=0.02)
    finally:
        hutb.stop_simulation()
        hutb.destroy(sim)


if __name__ == "__main__":
    main()
`
    },
    {
        id: 'sensor-data-collection',
        label: '传感器数据采集模板',
        description: '创建摄像头、激光雷达和雷达，采集数据并保留 CSV 友好的输出',
        defaultFileName: 'sensor_data_collection.py',
        content: `"""
HUTB 传感器数据采集模板
用于采集车辆状态、摄像头、激光雷达和毫米波雷达数据。
"""

import csv
import hutb


def main():
    sim = hutb.init_simulator(host="localhost", port=8000)
    scene = hutb.load_scene("/scenes/city_crossing.scene")
    car = hutb.create_vehicle("sedan", (0, 0, 0), color="green")

    camera = hutb.add_sensor(car, "camera", position=(0, 0, 1.6))
    lidar = hutb.add_sensor(car, "lidar", position=(0, 0, 2.2))
    radar = hutb.add_sensor(car, "radar", position=(0.8, 0, 1.2))
    hutb.update_sensor_params(camera, sample_rate=30, fov=90)
    hutb.update_sensor_params(lidar, sample_rate=20, fov=120)

    hutb.start_simulation(realtime=True)

    with open("hutb_sensor_log.csv", "w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["step", "x", "y", "speed", "camera", "lidar", "radar"])

        try:
            for step in range(600):
                hutb.set_vehicle_control(car, throttle=0.5, brake=0.0, steer=0.0)
                hutb.step(delta_time=0.02)

                state = hutb.get_vehicle_state(car)
                camera_data = hutb.get_sensor_data(camera)
                lidar_data = hutb.get_sensor_data(lidar)
                radar_data = hutb.get_sensor_data(radar)
                writer.writerow([
                    step,
                    state.position.x,
                    state.position.y,
                    state.speed,
                    camera_data,
                    lidar_data,
                    radar_data,
                ])
        finally:
            hutb.stop_simulation()
            hutb.destroy(sim)


if __name__ == "__main__":
    main()
`
    }
];

export function sanitizePythonFileName(input: string): string {
    const cleaned = input.trim().split('').map(char => {
        const code = char.charCodeAt(0);
        return code < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char;
    }).join('');
    const withExtension = cleaned.toLowerCase().endsWith('.py') ? cleaned : `${cleaned}.py`;
    return withExtension || 'hutb_simulation.py';
}

export function listTemplateItems(customTemplates: SimulationScriptTemplate[] = []): SimulationScriptTemplate[] {
    return [
        ...BUILTIN_SIMULATION_TEMPLATES,
        ...customTemplates.map(template => ({ ...template, custom: true }))
    ];
}

export class HutbScriptTemplateManager {
    private readonly context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async createScript(targetUri?: vscode.Uri) {
        const templates = listTemplateItems(this.getCustomTemplates());
        const selected = await vscode.window.showQuickPick(
            templates.map(template => ({
                label: template.label,
                description: template.custom ? '自定义模板' : template.description,
                detail: template.custom ? template.description : undefined,
                template
            })),
            { placeHolder: '选择人车模拟器脚本模板' }
        );

        if (!selected) {
            return;
        }

        const targetDir = await this.resolveTargetDirectory(targetUri);
        if (!targetDir) {
            return;
        }

        const fileName = await vscode.window.showInputBox({
            prompt: '输入脚本文件名',
            value: selected.template.defaultFileName,
            validateInput: value => value.trim() ? undefined : '文件名不能为空'
        });
        if (!fileName) {
            return;
        }

        const fileUri = vscode.Uri.file(path.join(targetDir, sanitizePythonFileName(fileName)));
        const exists = await this.exists(fileUri);
        if (exists) {
            const overwrite = await vscode.window.showWarningMessage(
                `文件已存在：${fileUri.fsPath}`,
                '覆盖'
            );
            if (overwrite !== '覆盖') {
                return;
            }
        }

        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(selected.template.content, 'utf8'));
        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document);
        vscode.window.showInformationMessage(`已创建 HUTB 仿真脚本：${fileUri.fsPath}`);
    }

    public async saveActiveFileAsCustomTemplate() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python') {
            vscode.window.showWarningMessage('请先打开一个 Python 仿真脚本。');
            return;
        }

        const label = await vscode.window.showInputBox({
            prompt: '输入自定义模板名称',
            value: path.basename(editor.document.uri.fsPath, '.py'),
            validateInput: value => value.trim() ? undefined : '模板名称不能为空'
        });
        if (!label) {
            return;
        }

        const customTemplates = this.getCustomTemplates();
        const id = `custom-${Date.now()}`;
        customTemplates.push({
            id,
            label,
            description: '从当前脚本保存的自定义 HUTB 模板',
            defaultFileName: sanitizePythonFileName(`${label}.py`),
            content: editor.document.getText(),
            custom: true
        });

        await this.context.globalState.update(CUSTOM_TEMPLATE_KEY, customTemplates);
        vscode.window.showInformationMessage(`已保存自定义 HUTB 模板：${label}`);
    }

    public getCustomTemplates(): SimulationScriptTemplate[] {
        return this.context.globalState.get<SimulationScriptTemplate[]>(CUSTOM_TEMPLATE_KEY, []);
    }

    private async resolveTargetDirectory(targetUri?: vscode.Uri): Promise<string | undefined> {
        if (targetUri?.fsPath) {
            const stat = await vscode.workspace.fs.stat(targetUri);
            if (stat.type === vscode.FileType.Directory) {
                return targetUri.fsPath;
            }
            return path.dirname(targetUri.fsPath);
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            return workspaceFolder.uri.fsPath;
        }

        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: '选择脚本保存目录'
        });
        return selected?.[0]?.fsPath;
    }

    private async exists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }
}
