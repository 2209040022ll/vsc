# HUTB 人车模拟器开发助手

面向人车模拟器的快速开发验证 VSCode 插件系统，为 HUTB 仿真框架和 MCP 通信协议提供一站式开发工具。

## 功能特性

### 1. 代码智能补全
- 输入 `hutb.` 或 `mcp.` 自动弹出 API 函数补全列表
- 显示函数签名、参数说明、返回值类型和使用示例
- 自动插入必填参数占位符
- 已弃用 API 添加删除线标记并提示替代方案

### 2. 语法高亮
- HUTB/MCP 模块导入语句高亮
- 核心函数名称语法着色
- 已弃用函数特殊颜色标记
- 特定常量和枚举值高亮

### 3. 基于抽象语法树的仿真逻辑错误检测
- 基于 HUTB/MCP 函数调用语法树提取仿真对象、参数和执行顺序
- **未知函数检测**：拼写错误自动提示相似函数名
- **参数数量检查**：必填参数缺失或参数过多时给出提示
- **已弃用 API 警告**：使用弃用函数时显示警告并建议替代
- **仿真顺序检查**：检测未调用 `hutb.init_simulator()` 就创建车辆、加载场景或启动仿真的逻辑错误
- **仿真对象追踪**：检测车辆、传感器、场景变量重复定义或引用不存在
- **参数范围检查**：检测车速、采样率、视场角、天气强度等领域参数是否越界
- **一键修复**：对已弃用 HUTB/MCP 接口提供快速替换操作

### 4. 仿真参数热重载
- 保存 Python 脚本时自动识别 `hutb.set_vehicle_speed()`、`hutb.update_sensor_params()`、`hutb.update_scene_lighting()` 等参数更新语句
- 通过配置的 MCP HTTP 网关向运行中的模拟器发送增量更新指令
- 状态栏显示热重载成功或失败原因，例如速度越界、MCP 连接超时

### 5. 仿真数据实时可视化面板
- 在资源管理器侧边栏显示 `HUTB 仿真监控` 面板
- 实时拉取 HUTB 遥测接口，展示车辆速度曲线、车速仪表盘和二维轨迹图
- 使用 ECharts 渲染监控图表，接口未连接时可显示演示数据便于答辩演示
- 支持一键导出车辆坐标、速度、加速度、方向盘角度、摄像头/雷达统计到 CSV

### 6. 签名帮助与悬停文档
- 参考 OpenHUTB/vsc 的交互方式，输入函数调用时显示参数签名
- 鼠标悬停在 HUTB/MCP 函数名上显示说明、参数和返回值

### 7. 常用仿真场景一键生成模板
- 资源管理器右键或命令面板可新建 `HUTB: 新建人车模拟器脚本`
- 内置基础单车辆控制、多车协同、传感器数据采集 3 个模板
- 模板自带初始化、场景加载、车辆/传感器创建、运行循环和清理逻辑
- 支持将当前 Python 脚本保存为自定义模板，后续重复使用

### 8. 多场景一键调试
- 通过 `HUTB: 选择调试模板` 自动生成或更新 `.vscode/launch.json`
- 内置 5 种调试模板：单车辆控制、多车协同、传感器数据采集、MCP 热重载联调、批量仿真用例调试
- 每个模板自动注入对应的 `HUTB_DEBUG_SCENARIO`、MCP 地址或批量测试参数

### 9. 批量仿真任务调度与结果汇总
- 通过 `HUTB: 新建批量仿真测试配置` 生成 JSON 测试配置
- 配置多组场景、速度、天气等参数后可一键批量运行
- 插件向脚本注入 `HUTB_BATCH_CASE` 和 `HUTB_BATCH_PARAMS` 环境变量
- 自动收集 `HUTB_RESULT:{...}` 指标并生成 HTML 报告，包含统计、用例参数、仿真指标和失败原因

### 10. 仿真状态快照与断点续跑
- 通过 `HUTB: 保存仿真状态快照` 将当前脚本、场景对象、热重载参数和光标断点行保存为 JSON 快照
- 通过 `HUTB: 加载快照并续跑` 自动生成 `HUTB: 从快照续跑` 调试配置
- 续跑时注入 `HUTB_RESUME_SNAPSHOT`、`HUTB_RESUME_LINE` 和热重载参数环境变量，便于脚本从中间状态恢复

### 11. 仿真场景二维快速预览
- 资源管理器侧边栏新增 `HUTB 场景预览`
- 实时解析当前 Python 脚本中的车辆、传感器、行人/障碍物坐标并绘制二维布局
- 支持识别传感器挂载关系和行人目标点，未定义车辆引用会在预览中提示

### 12. 一键生成仿真实验报告
- 通过 `HUTB: 生成仿真实验报告` 自动汇总实验脚本、场景对象、仿真参数和 `HUTB_RESULT` 结果
- 支持导出 Markdown 或 Word `.docx` 实验报告
- 默认输出到工作区 `hutb-reports` 目录，可通过配置项修改

### 13. 一键打包开发环境
- 将 VSCode 便携版 + 插件 + Python 环境 + 依赖库打包为 ZIP
- 解压后双击 `start.bat` 即可启动完整开发环境，零配置
- 自动生成启动脚本和 VSCode 配置

### 14. 联动调试
- 一键启动 Python 调试器，自动配置调试环境
- 内置 5 种调试模板，覆盖单车、多车、传感器、MCP 热重载和批量用例
- 自动生成/更新 `launch.json` 配置

### 15. 自测试与发布
- 基于 `@vscode/test-electron` 的自动化测试
- 支持一键打包 `.vsix` 安装文件
- 支持一键发布到 VSCode 插件商城

## 快速开始

### 安装
1. 从 VSCode 插件商城搜索 "HUTB 人车模拟器" 安装
2. 或下载 `.vsix` 文件手动安装：`code --install-extension hutb-simulator-dev-0.1.0.vsix`

### 使用
1. 打开包含 Python 文件的工作区
2. 在 Python 文件中输入 `hutb.` 或 `mcp.` 即可获得智能补全
3. 按 `Ctrl+Shift+P` 打开命令面板，输入 "HUTB" 查看所有可用命令

### 可用命令
| 命令 | 说明 |
|------|------|
| `HUTB: 一键打包开发环境` | 将完整开发环境打包为 ZIP |
| `HUTB: 启动调试` | 自动配置并启动 Python 调试器 |
| `HUTB: 选择调试模板` | 选择预设的调试配置模板 |
| `HUTB: 打开仿真监控面板` | 打开侧边栏实时可视化面板 |
| `HUTB: 导出仿真监控 CSV` | 导出监控面板采集到的遥测数据 |
| `HUTB: 打开二维场景预览` | 打开侧边栏车辆、传感器、障碍物二维布局预览 |
| `HUTB: 新建人车模拟器脚本` | 从内置或自定义模板生成仿真脚本 |
| `HUTB: 保存当前脚本为模板` | 将当前 Python 文件保存为本地自定义模板 |
| `HUTB: 新建批量仿真测试配置` | 生成 JSON 批量测试配置文件 |
| `HUTB: 运行批量仿真测试` | 批量运行仿真用例并生成 HTML 报告 |
| `HUTB: 保存仿真状态快照` | 保存当前脚本场景、参数和断点续跑上下文 |
| `HUTB: 加载快照并续跑` | 选择快照并生成续跑调试配置 |
| `HUTB: 生成仿真实验报告` | 导出 Markdown 或 Word 格式实验报告 |
| `HUTB: 运行测试` | 执行插件自动化测试 |
| `HUTB: 打包插件` | 打包为 .vsix 安装文件 |
| `HUTB: 发布插件` | 发布到 VSCode 插件商城 |

## 配置项

在 VSCode 设置中搜索 "hutb" 可配置以下选项：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `hutb.pythonPath` | Python 解释器路径 | 自动检测 |
| `hutb.sdkVersion` | HUTB SDK 版本号 | 空 |
| `hutb.packConfig.vscodePath` | VSCode 便携版路径 | 空 |
| `hutb.packConfig.pythonEnvPath` | Python 环境路径 | 空 |
| `hutb.packConfig.outputDir` | 打包输出目录 | 空 |
| `hutb.hotReload.enabled` | 保存脚本时启用仿真参数热重载 | `true` |
| `hutb.hotReload.mcpEndpoint` | MCP 热重载 HTTP 网关地址 | `http://127.0.0.1:9000/hutb/hot-reload` |
| `hutb.hotReload.timeoutMs` | 热重载请求超时时间 | `1500` |
| `hutb.monitor.telemetryEndpoint` | HUTB 实时遥测 JSON 接口地址 | 空 |
| `hutb.monitor.pollIntervalMs` | 监控面板拉取间隔 | `1000` |
| `hutb.monitor.historySize` | 保留历史采样点数量 | `120` |
| `hutb.monitor.useMockWhenDisconnected` | 未连接 HUTB 接口时显示演示数据 | `true` |
| `hutb.batch.defaultTimeoutMs` | 批量测试单个用例默认超时时间 | `60000` |
| `hutb.batch.reportOutputDir` | 批量测试 HTML 报告输出目录 | 空 |
| `hutb.snapshot.outputDir` | 仿真状态快照输出目录 | 空 |
| `hutb.report.outputDir` | 仿真实验报告输出目录 | 空 |
| `hutb.report.defaultFormat` | 实验报告默认格式：`markdown` 或 `docx` | `markdown` |

## 项目结构

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
│           ├── index.ts
│           ├── completion.test.ts
│           ├── diagnostics.test.ts
│           ├── debugConfig.test.ts
│           └── packaging.test.ts
├── syntaxes/                      # 语法定义
│   └── hutb.tmLanguage.json       # TextMate 语法高亮规则
├── package.json                   # 插件清单
├── tsconfig.json                  # TypeScript 配置
└── CHANGELOG.md                   # 更新日志
```

## 开发

### 环境要求
- Node.js 18.x 或 20.x
- VSCode 1.80.0+
- Python 3.9+

### 构建与调试
```bash
# 安装依赖
npm install

# 编译
npm run compile

# 一键验收全部核心功能
npm run test:features

# 监听模式
npm run watch

# 运行测试
npm test

# 打包 .vsix
npm run package

# 发布
npm run publish
```

### 调试插件
1. 在 VSCode 中打开项目
2. 按 `F5` 启动扩展开发宿主
3. 在新窗口中打开 Python 文件测试插件功能

## 技术栈
- **VSCode Extension API** - 插件开发框架
- **TypeScript 5.x** - 核心开发语言
- **Node.js** - 运行环境与工具链
- **TextMate Grammar** - 语法高亮规则
- **@vscode/test-electron** - 自动化测试框架
- **archiver** - ZIP 压缩

## 许可证

MIT

## 仓库地址

[https://github.com/OpenHUTB/vscode-ext](https://github.com/OpenHUTB/vscode-ext)
