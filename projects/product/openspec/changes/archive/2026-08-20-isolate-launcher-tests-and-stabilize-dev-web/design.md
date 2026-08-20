## Context

Buildr 当前有三条被混在一起的路径：普通产品验证、浏览器使用测试（Browser Use Test）和平台启动入口集成（Platform Launcher Integration）。`release-smoke.mjs` 会通过 macOS `open` 或 Windows shortcut 启动真实 Launcher；虽然尝试传入 `BUILDR_LAUNCHER_NO_OPEN=1`，该环境变量经过平台启动服务传播并不稳定。macOS runner 又把任何非零退出都解释为“启动失败”，所以测试清理进程时可能显示系统弹窗。真实浏览器冒烟本身使用无头 Playwright，遗留标签页来自 Launcher 的默认浏览器副作用，不是 Browser Use 测试。

Development Launcher 当前显式传入 `--port 0`。自举连续性只复用安装前观察到的端口，而且独立连续性脚本的默认数据根仍指向正式版名称，导致未显式覆盖环境时可能看不到真实 Development 实例。

## Goals / Non-Goals

**Goals:**

- 普通 affected/full/Candidate 验证不调用真实平台 GUI，不显示系统通知，不打开默认浏览器，也不读取或停止用户的 Development Web。
- 保留一条显式平台 Launcher 集成验收，用于对应操作系统 runner 或维护者手工执行。
- Buildr Web Dev 的 Launcher 默认地址稳定为 `127.0.0.1:4458`。
- self-bootstrap 在更新 Development Launcher 前后保持“运行则恢复、未运行则不启动”的意图，并把旧随机端口实例迁移到 `4458`。
- 保持正式 npm Launcher 的 `4457 + 一次随机回退`策略、任务预览随机端口和显式 CLI 端口能力不变。

**Non-Goals:**

- 不把平台 Launcher 集成归类为 Browser Use 测试。
- 不让普通测试操作用户真实浏览器标签页，也不尝试关闭用户已有标签页。
- 不为 Development Web 提供端口自动扫描、随机回退或强杀占用者。
- 不改变 Buildr Web 前端页面、HTTP API 或 Workspace 管理模型。

## Decisions

### 1. 普通验证与平台入口分成两条可执行路径

默认 release smoke 直接执行已生成 Launcher 的无界面入口，并使用隔离 `HOME`、`BUILDR_APP_DATA_DIR`、`BUILDR_PRODUCT_DATA_DIR`、`BUILDR_LAUNCHER_NO_OPEN=1` 和 `BUILDR_LAUNCHER_NO_NOTIFY=1`。它继续验证安装、binding、Host Node、Web readiness、重复启动、端口策略、repair/uninstall 与清理，但不经过 LaunchServices、Explorer 或默认浏览器。

显式平台验收通过独立参数/入口启用，才调用 macOS `open` 或 Windows shortcut。该入口仍强制 no-open/no-notify，并使用隔离数据根；它只证明平台启动服务能够执行已安装入口及复用实例，不承担页面交互。

选择这种拆分，而不是让普通验证继续依赖平台环境变量传播，是因为后者本身就是不稳定边界；普通产品回归不应把 GUI 会话当作测试运行时。也不选择测试后关闭浏览器标签页，因为测试无法证明标签页 ownership，关闭会伤害用户会话。

### 2. Launcher 提供显式的自动验证静默开关

正式 macOS wrapper 保留真实用户启动失败时的 `osascript` 诊断，但识别内部环境变量 `BUILDR_LAUNCHER_NO_NOTIFY=1`，并把它传给后台 runner。验证路径同时设置 no-open 与 no-notify；生产 Launcher 默认不设置，真实安装/binding 漂移仍可见。

该开关只抑制展示副作用，不改变退出状态、日志、readiness 或失败判断，因此不会把测试失败伪装为成功。Launcher runner 正常收到 Runtime 的 SIGTERM 清理仍以成功退出处理；自动验证即使在启动窗口内主动清理，也不会弹窗。

### 3. Development Launcher 固定使用端口 4458

macOS 和 Windows Development Launcher 都传入 `--port 4458`。`4458` 与正式 npm Launcher 默认 `4457` 相邻但隔离，便于用户和 Agent 识别稳定入口。Development Launcher 不配置随机回退：同 profile 健康实例按现有单实例语义复用；外部进程占用 `4458` 时返回明确 `EADDRINUSE` 诊断并保留占用者。

显式 `buildr web --port <port>` 仍可用于诊断或特殊开发；Task Preview 继续使用临时数据根和随机端口。固定端口只属于 Development Launcher，不从端口反推产品身份。

### 4. self-bootstrap 恢复固定端口上的运行意图

连续性脚本默认解析 Development Web Data Root，而不是 released Root。安装前只有通过 instance secret 健康检查且 Launcher identity 为 development 的实例才被视为“正在运行”。若存在该实例，Launcher 更新后通过 retained `projects/product/buildr`、精确 Node 和新 identity 在 `4458` 启动；旧实例即使位于历史随机端口，也通过现有认证 handoff 迁移到固定端口。结果同时记录 previous port 与 current port、前后 PID 和 retained successor identity。

安装前为 not-running、stale 或 different-owner 时，只更新 Launcher，不自动启动服务。恢复失败只形成自举激活注意（Activation Attention），保留已交付代码和已安装 Launcher，不回滚交付、不强杀 foreign 端口占用者；本次后续 activation 阶段停止，等待 Agent 诊断恢复。

### 5. 通过验证注册表约束副作用归属

普通 registry step 的环境足迹只允许隔离文件系统、CLI、loopback 与 owned process；平台 GUI 入口不进入 affected/full 默认选择。新增 focused contract 会证明：

- Browser smoke 使用 headless、临时 Root、随机端口并关闭 owned browser/server；
- normal release smoke 不含平台 `open`/shortcut 调用；
- 只有显式 platform launcher 入口可引用平台 GUI 启动命令；
- Development Launcher 两个平台均绑定 `4458`；
- self-bootstrap 使用 Development Root，并覆盖 legacy random port 到固定端口迁移、未运行不启动与 occupied port 失败。

## Risks / Trade-offs

- [固定端口被 foreign process 占用] → 明确失败并报告端口/owner 不可证明，不回退随机端口、不停止占用者；Agent 可让用户释放端口后重试。
- [历史 Development 实例位于随机端口] → 首次适用 self-bootstrap 时做一次认证迁移；迁移失败保留交付事实并形成 Activation Attention。
- [普通 release smoke 不再覆盖 LaunchServices/shortcut 激活] → 独立平台验收在对应 OS runner 或显式手工入口覆盖，且不混入日常验证。
- [静默开关被误用于真实用户启动] → 开关不进入 binding 或公开 CLI，只由验证 harness 注入；日志和退出状态始终保留。
- [直接执行 Launcher 与真实平台环境存在差异] → 普通验证负责产品逻辑与包装内容，显式平台验收负责该差异，两个结果不互相冒充。
