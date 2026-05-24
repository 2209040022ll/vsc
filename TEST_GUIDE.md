# HUTB 人车模拟器开发助手 - 测试指南

本文档详细说明如何测试 HUTB 人车模拟器开发助手 VSCode 插件，包括开发调试、打包安装、自动化测试等完整流程。

---

## 一、环境准备

### 1.1 系统要求

| 依赖 | 版本要求 |
|------|---------|
| Node.js | 18.x 或 20.x |
| VSCode | 1.80.0+ |
| Python | 3.9+ |

### 1.2 安装项目依赖

```bash
npm install
```

### 1.3 编译源码

```bash
npm run compile
```

编译成功后，会在项目根目录生成 `out/` 文件夹，包含编译后的 JavaScript 文件。

---

## 二、本地开发调试（F5 启动）

这是最常用的测试方式，适合开发过程中实时验证功能。

### 2.1 启动扩展开发宿主

1. 用 VSCode 打开本项目
2. 按 `F5` 或点击菜单 **运行 → 启动调试**
3. VSCode 会打开一个新的**扩展开发宿主窗口**（标题栏显示 `[扩展开发宿主]`）

### 2.2 在新窗口中测试

1. 在新窗口中打开一个包含 Python 文件的工作区
2. 新建或打开任意 `.py` 文件
3. 测试各项功能（见第四章功能测试清单）

### 2.3 监听模式（可选）

如果需要在修改代码后自动重新编译：

```bash
npm run watch
```

---

## 三、打包安装测试

模拟真实用户安装后的使用体验。

### 3.1 打包前检查

确保以下文件配置正确，否则打包会失败：

**`.vscodeignore` 文件**（不应包含 `out/`）：
```
node_modules/
.vscode-test/
src/
.gitignore
tsconfig.json
.eslintrc.json
```

**`.gitignore` 文件**（不应包含 `out/`）：
```
node_modules/
.vscode-test/
*.vsix
dist/
```

**图标文件**：确保 `resources/icon.png` 存在（建议 128x128 像素）

### 3.2 打包生成 .vsix 文件

```bash
npm run package
```

成功后会生成 `hutb-simulator-dev-0.1.0.vsix` 文件。

### 3.3 安装到 VSCode

```bash
code --install-extension hutb-simulator-dev-0.1.0.vsix
```

### 3.4 重启 VSCode

安装完成后重启 VSCode，打开任意 Python 文件测试功能。

### 3.5 卸载测试版

测试完成后，如需卸载：

```bash
code --uninstall-extension OpenHUTB.hutb-simulator-dev
```

---

## 四、自动化测试

运行项目自带的测试用例，验证核心功能是否正常。

### 4.1 运行全部测试

```bash
npm test
```

这会启动 VSCode 测试宿主，自动执行 `src/test/suite/` 下的所有测试文件。

### 4.1.1 一键完整功能验收

```bash
npm run test:features
```

这会编译项目并直接运行 `scripts/full-feature-smoke.js`，不需要手动打开 VSCode。脚本会检查代码补全、签名帮助、悬停文档、语义诊断、热重载、监控 CSV、二维场景预览、快照续跑、实验报告、脚本模板、批量测试报告和打包关键文件，并在 `.feature-smoke/feature-smoke-report.html` 生成完整验收报告。

### 4.2 测试文件说明

| 测试文件 | 测试内容 |
|---------|---------|
| `completion.test.ts` | 代码补全功能测试 |
| `diagnostics.test.ts` | 错误检查功能测试 |
| `domainFeatures.test.ts` | 热重载、仿真监控、领域语义诊断和快速修复测试 |
| `workflowFeatures.test.ts` | 脚本模板、批量仿真测试配置、结果判定和 HTML 报告测试 |
| `innovationFeatures.test.ts` | 二维场景预览、快照续跑、实验报告导出测试 |
| `debugConfig.test.ts` | 调试配置功能测试 |
| `packaging.test.ts` | 打包功能测试 |

### 4.3 单独编译测试代码

```bash
npm run pretest
```

---

## 五、功能测试清单

### 5.1 代码智能补全

**测试方法**：
1. 新建 Python 文件
2. 输入 `hutb.` 或 `mcp.`

**预期结果**：
- 弹出 API 函数补全列表
- 显示函数签名、参数说明、返回值类型
- 自动插入必填参数占位符

### 5.2 语法高亮

**测试方法**：
1. 输入 `from hutb import simulation`
2. 输入 `from mcp import client`

**预期结果**：
- HUTB/MCP 模块导入语句高亮显示
- 核心函数名称有语法着色

### 5.3 错误检查 - 未知函数检测

**测试方法**：
1. 输入 `hutb.nonexistent_function()`

**预期结果**：
- 显示红色波浪线错误提示
- 提示信息中包含相似函数名建议

### 5.4 错误检查 - 参数数量检查

**测试方法**：
1. 调用一个需要参数的函数，但不传参数
2. 调用函数时传入过多参数

**预期结果**：
- 显示黄色/红色警告
- 提示缺少必填参数或参数过多

### 5.5 已弃用 API 警告

**测试方法**：
1. 调用已标记为弃用的 API 函数

**预期结果**：
- 显示黄色警告线
- 提示该函数已弃用，并建议替代方案
- 快速修复可一键替换为新接口

### 5.6 仿真语义错误检查

**测试方法**：
1. 在 `hutb.init_simulator()` 之前调用 `hutb.create_vehicle()`
2. 对未定义的 `car` 调用 `hutb.get_vehicle_state(car)`
3. 设置明显越界参数，例如 `hutb.set_vehicle_speed(car, speed=1000)`

**预期结果**：
- 初始化顺序错误显示红色错误
- 未定义车辆/传感器引用显示红色错误
- 车速、采样率、视场角等越界参数显示黄色警告

### 5.7 仿真参数热重载

**测试方法**：
1. 在设置中确认 `hutb.hotReload.enabled` 为 `true`
2. 配置 `hutb.hotReload.mcpEndpoint` 指向正在运行的 MCP 网关
3. 保存包含 `hutb.set_vehicle_speed()` 或 `hutb.update_sensor_params()` 的 Python 文件

**预期结果**：
- 状态栏显示热重载成功
- 参数越界或 MCP 连接失败时显示具体失败原因

### 5.8 仿真监控面板

**测试方法**：
1. 打开资源管理器侧边栏中的 `HUTB 仿真监控`
2. 可选：配置 `hutb.monitor.telemetryEndpoint` 为 HUTB 遥测 JSON 接口
3. 点击 `CSV` 导出监控数据

**预期结果**：
- 面板展示速度曲线、车速仪表盘和二维轨迹
- HUTB 接口未连接时显示演示数据，便于验证界面效果
- CSV 文件包含时间戳、车辆坐标、速度、加速度、方向盘角度和传感器统计

### 5.9 常用仿真场景模板

**测试方法**：
1. 在资源管理器中右键工作区目录
2. 选择 `HUTB: 新建人车模拟器脚本`
3. 分别选择基础单车辆控制、多车协同、传感器数据采集模板
4. 打开一个 Python 脚本，右键选择 `HUTB: 保存当前脚本为模板`

**预期结果**：
- 能生成 `.py` 仿真脚本
- 模板包含 `hutb.init_simulator()`、`hutb.load_scene()`、`hutb.create_vehicle()` 等领域流程代码
- 自定义模板会出现在后续模板选择列表中

### 5.10 批量仿真测试与报告生成

**测试方法**：
1. 在资源管理器中右键工作区目录
2. 选择 `HUTB: 新建批量仿真测试配置`
3. 打开生成的 `hutb-batch-test.json`，检查多组 `cases`
4. 右键该 JSON 文件，选择 `HUTB: 运行批量仿真测试`

**预期结果**：
- 插件按 JSON 中的用例逐个运行脚本
- 每个用例通过 `HUTB_BATCH_PARAMS` 获取速度、场景、天气等参数
- 脚本输出 `HUTB_RESULT:{...}` 后，插件能统计碰撞、耗时、到达目标等结果
- 工作区 `hutb-reports` 目录生成 HTML 报告，包含用例、参数、统计和失败原因

### 5.11 仿真状态快照与断点续跑

**测试方法**：
1. 打开一个包含车辆、传感器和热重载参数的 HUTB Python 脚本
2. 将光标放在希望续跑的位置
3. 执行 `HUTB: 保存仿真状态快照`
4. 执行 `HUTB: 加载快照并续跑`

**预期结果**：
- 工作区 `.hutb/snapshots` 下生成 JSON 快照
- `.vscode/launch.json` 中生成或更新 `HUTB: 从快照续跑`
- 调试环境变量包含 `HUTB_RESUME_SNAPSHOT`、`HUTB_RESUME_LINE` 和热重载参数

### 5.12 仿真场景二维快速预览

**测试方法**：
1. 打开包含 `hutb.create_vehicle()`、`hutb.add_sensor()`、`hutb.add_pedestrian()` 的 Python 脚本
2. 打开资源管理器侧边栏 `HUTB 场景预览`
3. 修改车辆或传感器坐标

**预期结果**：
- 侧边栏实时展示车辆、传感器、行人/障碍物二维布局
- 传感器显示为挂载在目标车辆上的点
- 引用未定义车辆时显示预览警告

### 5.13 一键生成仿真实验报告

**测试方法**：
1. 打开 HUTB Python 实验脚本
2. 执行 `HUTB: 生成仿真实验报告`
3. 分别选择 Markdown 和 Word 格式验证导出

**预期结果**：
- 工作区 `hutb-reports` 目录生成 `.md` 或 `.docx` 报告
- 报告包含脚本路径、场景文件、车辆/传感器/障碍物清单、实验参数和 `HUTB_RESULT` 指标

### 5.14 一键打包开发环境

**测试方法**：
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入并选择 `HUTB: 一键打包开发环境`

**预期结果**：
- 弹出配置向导
- 根据配置生成包含 VSCode + 插件 + Python 环境的 ZIP 文件

### 5.15 联动调试 - 启动调试

**测试方法**：
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入并选择 `HUTB: 启动调试`

**预期结果**：
- 自动生成或更新 `.vscode/launch.json`
- 启动 Python 调试器

### 5.16 联动调试 - 选择调试模板

**测试方法**：
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入并选择 `HUTB: 选择调试模板`

**预期结果**：
- 显示 5 种预设调试模板（单车辆控制、多车协同、传感器数据采集、MCP 热重载联调、批量仿真用例调试）
- 选择后自动更新调试配置

### 5.17 状态栏显示

**测试方法**：
1. 打开任意 Python 文件
2. 查看 VSCode 底部状态栏

**预期结果**：
- 状态栏显示 HUTB 相关状态信息

---

## 六、命令速查表

### 6.1 开发命令

| 命令 | 作用 |
|------|------|
| `npm install` | 安装项目依赖 |
| `npm run compile` | 编译 TypeScript 源码 |
| `npm run watch` | 监听模式，自动编译修改 |
| `npm run lint` | 运行 ESLint 代码检查 |

### 6.2 测试命令

| 命令 | 作用 |
|------|------|
| `npm test` | 运行自动化测试套件 |
| `npm run pretest` | 编译测试代码 |

### 6.3 打包发布命令

| 命令 | 作用 |
|------|------|
| `npm run package` | 打包为 .vsix 安装文件 |
| `npm run publish` | 发布到 VSCode 插件商城 |

### 6.4 VSCode 命令

| 命令 | 作用 |
|------|------|
| `F5` | 启动扩展开发宿主调试 |
| `code --install-extension xxx.vsix` | 安装 .vsix 插件 |
| `code --uninstall-extension publisher.name` | 卸载插件 |

---

## 七、常见问题排查

### 7.1 打包失败：Extension entrypoint(s) missing

**原因**：`out/` 目录被 `.vscodeignore` 或 `.gitignore` 排除

**解决**：
1. 检查 `.vscodeignore`，确保没有 `out/`
2. 检查 `.gitignore`，确保没有 `out/`
3. 确认 `out/extension.js` 文件存在

### 7.2 打包失败：icon.png wasn't found

**原因**：`resources/icon.png` 文件缺失

**解决**：
1. 创建 `resources/` 目录
2. 放入一个 128x128 像素的 `icon.png` 文件

### 7.3 智能补全不生效

**原因**：文件语言模式不是 Python

**解决**：
1. 确保文件保存为 `.py` 扩展名
2. 点击 VSCode 右下角语言模式，选择 Python

### 7.4 调试启动失败

**原因**：VSCode Python 扩展未安装

**解决**：在 VSCode 扩展商店搜索并安装 "Python" 扩展（Microsoft 官方）

### 7.5 测试运行失败

**原因**：代码未编译或测试代码有语法错误

**解决**：
```bash
npm run compile
npm test
```

---

## 八、项目结构参考

```
├── data/                          # 数据文件
│   ├── api-definitions.json       # HUTB/MCP API 定义
│   ├── debug-templates.json       # 调试配置模板
│   └── pack-config.json           # 打包配置
├── samples/                       # 示例代码
│   ├── example_simulation.py      # 基础仿真示例
│   └── mcp_communication.py       # MCP 通信示例
├── src/                           # 源代码
│   ├── extension.ts               # 插件入口
│   ├── modules/                   # 功能模块
│   │   ├── completion.ts          # 代码补全
│   │   ├── diagnostics.ts         # 错误检查
│   │   ├── packager.ts            # 环境打包
│   │   ├── debugger.ts            # 联动调试
│   │   ├── hotReload.ts           # MCP 参数热重载
│   │   ├── simulationMonitor.ts   # 仿真监控面板
│   │   ├── scenePreview.ts        # 二维场景预览
│   │   ├── simulationSnapshot.ts  # 快照与续跑
│   │   ├── experimentReport.ts    # 实验报告导出
│   │   ├── batchSimulation.ts     # 批量仿真调度
│   │   └── statusBar.ts           # 状态栏
│   ├── utils/                     # 工具类
│   │   └── apiLoader.ts           # API 定义加载器
│   └── test/                      # 测试文件
│       ├── runTest.ts             # 测试入口
│       └── suite/                 # 测试套件
├── syntaxes/                      # 语法定义
│   └── hutb.tmLanguage.json       # TextMate 语法高亮规则
├── resources/                     # 资源文件
│   └── icon.png                   # 插件图标
├── package.json                   # 插件清单
├── tsconfig.json                  # TypeScript 配置
└── TEST_GUIDE.md                  # 本测试指南
```

---

## 九、版本信息

- 插件版本：0.1.0
- 最低 VSCode 版本：1.80.0
- 开发语言：TypeScript 5.x
- 测试框架：Mocha + @vscode/test-electron

---

*本文档随项目更新，如有疑问请参考 README.md 或提交 Issue。*
