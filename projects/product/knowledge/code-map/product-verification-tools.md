# 采用实例：Buildr 产品测试工具地图

Buildr 产品是[通用项目与服务测试验证框架](../docs/architecture/workspace-testing-and-verification-framework.md)的一个采用实例。本图定位它自己的测试选择、执行、前端检查、候选聚合和上下文复用实现；这些工具不构成用户项目的必需技术栈。通用方法及软件支持见[通用框架实现地图](verification-framework.md)。

产品路径相对于 `projects/product/`；发布技能（Skill）脚本位于工作空间根的 `skills/buildr-release/`。发布主线见[唯一发布说明](../docs/flows/open-source-release.md)。本实例的稳定入口和准备方式见[产品测试地图](../../verification.yml)、[准备声明](../../preparation.yml)，职责与限制见[产品测试架构](../docs/architecture/verification-framework.md)。

## 产品测试工具：发现、选择、执行

这些文件服务 Buildr 产品自己的工程验证。公开入口承接具体检查、类型、全量或相关请求，登记与实际发现决定检查集合；规划器（Planner）与 `executePlan()` 通过原有依赖调度和执行器（Executor）调用真实工具。依赖方向是项目工具消费测试及公共技术能力，不是通用项目地图模块反向执行这些脚本。

- **`services/buildr/test/verification/`** — 产品自己的测试编排
  - [cli.ts](../../services/buildr/test/verification/cli.ts) — 六个公开入口的请求解析、选择预览、登记核对与实际执行；不要求正式任务或比较基线
  - [journey-suites.ts](../../services/buildr/test/verification/journey-suites.ts) — 已有真实集成和完整流程的分组与资源归属
  - [journeys.ts](../../services/buildr/test/verification/journeys.ts) — 核对实际测试归属，按登记集合调用集成测试（Integration Test）与端到端测试（End-to-End Test，E2E）
  - [source.ts](../../services/buildr/test/verification/source.ts) — 本机源码入口，分别选择通用检查与当前系统的原生源码检查；按本轮普通结果保留成功，只准备和执行失败及未执行项，不生产或消费最终原包
  - [artifact.ts](../../services/buildr/test/verification/artifact.ts) — 本机原包入口，显式读取同一原包目录；通用原包与本机平台分别选择，按依赖档位排序并在准备后重新判断有效结果；不回退制包
  - [candidate-artifact-reuse.ts](../../services/buildr/test/verification/candidate-artifact-reuse.ts) — 原包证明的有界交接、原字节及真实平台核验、暂留本机缺项及原始来源保留；同原包成功子项不按配方或依赖摘要失效
  - [candidate-round.ts](../../services/buildr/test/verification/candidate-round.ts) — 读写本轮普通日志，按检查编号及实际平台保留成功、选择失败和未执行项；不比较文件、配方和依赖摘要
  - [verification-reuse.ts](../../services/buildr/test/verification/verification-reuse.ts) — 非候选入口保留的历史摘要缓存；候选路径由 candidate-round.ts 独立接续，不消费该缓存的失效判定
  - [verification-inputs.ts](../../services/buildr/test/verification/verification-inputs.ts) — 已核验运行检查的产品与配方输入分离、静态依赖及子脚本读取；未知输入保守回退
  - [verification-source-inputs.ts](../../services/buildr/test/verification/verification-source-inputs.ts) — 本机与正式补验共享的源码读取、字节与权限规范化、范围及逐项输入；准确提交只读 Git 对象，不切换工作目录
  - [local-source-verification.ts](../../services/buildr/test/verification/local-source-verification.ts) — 发布派发前读取同轮主包及插件普通日志，失败或未执行项只返回补齐动作
  - [candidate-source-reuse.ts](../../services/buildr/test/verification/candidate-source-reuse.ts) — 有界受控交接、源码分片（Shard）覆盖计算；轮次及真实平台由普通结果入口核对
  - [test-files.ts](../../services/buildr/test/verification/test-files.ts) — 解析安全路径、展开文件匹配并去重，空集合失败
  - [ownership.ts](../../services/buildr/test/verification/ownership.ts) — 改动路径归属、排除项、委托与扩大范围的依据
  - [registry.ts](../../services/buildr/test/verification/registry.ts) — 稳定步骤、职责分片、通用／平台归属、主要证明责任、真实工作进程额度及候选分片；平台归属与运行场所分别声明
  - [platform-boundaries.ts](../../services/buildr/test/verification/platform-boundaries.ts) — macOS 与 Windows 原生命令、路径／锁、文件描述符／进程及原包启动器的具体机制与最小断言；不以系统名称复制通用功能
  - [planner.ts](../../services/buildr/test/verification/planner.ts) — 校验步骤与预算，依据实际请求、类型与相关输入选择范围并给出原因，不把静态或单元组设为其他独立检查的全局前置
  - [plan-runner.ts](../../services/buildr/test/verification/plan-runner.ts) — 一次执行的准备、资源协调、调度与汇总
  - [dag-scheduler.ts](../../services/buildr/test/verification/dag-scheduler.ts) — 依赖、并发类别、具名资源和数字容量的调度
  - [executor.ts](../../services/buildr/test/verification/executor.ts) — 将步骤和实际额度转成具体子进程调用
  - [resource-coordinator.ts](../../services/buildr/test/verification/resource-coordinator.ts) — 同机多次执行间的共享资源协调
  - [candidate.ts](../../services/buildr/test/verification/candidate.ts) — 内部发布候选（Candidate）集合入口，只执行当前机器适用的登记步骤；不作为日常并列类型入口
  - [candidate-ci.ts](../../services/buildr/test/verification/candidate-ci.ts) — 按有效证明选择跨平台源码／原包缺项，执行宿主 Node.js（Host Node）组合并汇总；全部必需源码通过后才进入产包
  - [candidate-ci-evidence.ts](../../services/buildr/test/verification/candidate-ci-evidence.ts) — 检查证据齐全性以及源码、登记、作业和唯一压缩包身份
  - [candidate-repair.ts](../../services/buildr/test/verification/candidate-repair.ts) — 同轮原包补验保留成功、只补失败及缺项；核对原字节、真实平台和最低宿主，保留原始来源
  - [candidate-repair-cli.ts](../../services/buildr/test/verification/candidate-repair-cli.ts) — 受控原运行、真实包读取，生成缺项矩阵及保留证据；采用不变 DSH 原包与精确对端证明
  - [browser-selector-dispatcher.ts](../../services/buildr/test/verification/browser-selector-dispatcher.ts) — 选择页面检查并准备隔离 `web-dist`；对话场景可选单组，完整运行按资源预算调度共享队列中的场景组
  - `release/`
    - [browser-candidate.ts](../../services/buildr/test/verification/release/browser-candidate.ts) — 校验唯一候选压缩包（Candidate Tarball）、解包并直接托管包内 `web-dist`，执行核心旅程及清理；测试驱动仍来自当前源码，不替代安装后全部行为验收
    - [verify-pr-candidate.ts](../../services/buildr/test/verification/release/verify-pr-candidate.ts) — 生成受控候选矩阵并汇总源码、平台、原包及插件证明
    - [release-consumption.ts](../../services/buildr/test/verification/release/release-consumption.ts) — 发布消费要求及已有候选证明映射；真实官方消费另行核验
  - `timing/`
    - [report.ts](../../services/buildr/test/verification/timing/report.ts) — 汇总实际步骤结果、上下文（Context）、耗时与诊断文件
  - `docs/`
    - [quality.ts](../../services/buildr/test/verification/docs/quality.ts) — 检查文档相对链接存在且不越出产品根；不判断正文语义
- [services/buildr/package.json](../../services/buildr/package.json) — 稳定命令、生成物准备、测试及公开包导出
- [services/buildr-web/package.json](../../services/buildr-web/package.json) — 前端构建及独立逻辑测试入口
- **`services/buildr-web/test/browser/`** — 对话浏览器场景按职责分文件；完整运行最多启动两个受资源预算约束的工作进程（Worker），从共享队列动态领取组，在各自现场复用浏览器和服务，每组重新隔离页面与测试数据。单组可通过 `BUILDR_AGENT_JOURNEY_PART` 选择；组失败保留失败结果，受污染现场不再领取其他组。
  - [agent-conversation-fixture.ts](../../services/buildr-web/test/browser/agent-conversation-fixture.ts) — 每组的对话接口替身、测试数据、页面操作与清理
  - [agent-conversation-groups.ts](../../services/buildr-web/test/browser/agent-conversation-groups.ts) — 可选场景组、工作进程数量、逐组执行与失败汇总
  - [agent-conversation-queue.ts](../../services/buildr-web/test/browser/agent-conversation-queue.ts) — 共享队列的原子领取、已尝试标记和未完成组检查；标记不代表通过
  - [agent-conversation-isolation.ts](../../services/buildr-web/test/browser/agent-conversation-isolation.ts) — 限制未模拟的服务端写入并重置允许的最近访问，异常时停止复用现场
  - [agent-conversations-journey.ts](../../services/buildr-web/test/browser/agent-conversations-journey.ts) — 选择场景组，为每组装配和释放独立夹具
  - [agent-conversations-setup-scenarios.ts](../../services/buildr-web/test/browser/agent-conversations-setup-scenarios.ts) — 导航、对话入口与基础交互
  - [agent-conversations-history-scenarios.ts](../../services/buildr-web/test/browser/agent-conversations-history-scenarios.ts) — 对话记录、展示与恢复
  - [agent-conversations-handoff-scenarios.ts](../../services/buildr-web/test/browser/agent-conversations-handoff-scenarios.ts) — 执行者交接、异常后的继续与重试
  - [agent-conversations-tasks-scenarios.ts](../../services/buildr-web/test/browser/agent-conversations-tasks-scenarios.ts) — 任务对话入口、草稿与并发交互
  - [agent-conversations-models-scenarios.ts](../../services/buildr-web/test/browser/agent-conversations-models-scenarios.ts) — 模型与推理强度、执行操作及窄屏交互
  - [agent-conversations-recovery-scenarios.ts](../../services/buildr-web/test/browser/agent-conversations-recovery-scenarios.ts) — 未知执行状态核对与事件流断线恢复
  - [agent-conversations-selection-scenarios.ts](../../services/buildr-web/test/browser/agent-conversations-selection-scenarios.ts) — 新建草稿、跨工作空间选择与首次发送
  - [agent-conversations-video-scenarios.ts](../../services/buildr-web/test/browser/agent-conversations-video-scenarios.ts) — 视频输入、发送、播放与错误处理
- **`skills/buildr-release/scripts/`（工作空间根）** — 发布协调、产包及恢复；检查仍由验证框架承担
  - [release-orchestration-runner.ts](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/release-orchestration-runner.ts) — 正常准备、只读逐包运行观察、授权公开及恢复入口
  - [candidate-package.ts](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/candidate-package.ts) — 生产主包原字节，供后续检查共同消费
  - [candidate-source-binding.ts](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/candidate-source-binding.ts) — 原产包与验证提交的真实构建输入比较；调用共享输入实现形成检查身份，旧算法只核验历史结果；另行保护发布工具检出
  - [candidate-repair-operation.ts](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/candidate-repair-operation.ts) — 在原承载引用请求正式补验，未知请求回读，保留原包和运行指针
  - [release-failure.ts](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/release-failure.ts) — 有界命令诊断、明确拒绝识别与阶段恢复建议；不创建第二份发布事实
  - [release-publication.ts](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/release-publication.ts) — 沿用逐效果日志，绑定准确原包及运行尝试；npm 写入未知时只回读，缺失原日志只停止相关新增写入
  - [release-rehearsal.ts](https://github.com/BuildrAI/Buildr/blob/dev/skills/buildr-release/scripts/release-rehearsal.ts) — 显式演练使用 v2 准备文件持久保存请求意图；旧 v1 或无持久位置仅回读恢复，终态仍需检查完整性
- **`services/buildr/tools/development/`** — 真实开发环境边界
  - [run-development-npm.ts](../../services/buildr/tools/development/run-development-npm.ts) — 检查当前 Node.js 在项目声明范围内并调用相邻 npm；无扩展名的同名入口负责在声明范围内选择 Node.js（声明版本优先）
  - [run-isolated-workspace-check.ts](../../services/buildr/tools/development/run-isolated-workspace-check.ts) — 隔离工作目录和两类应用数据目录，统一成功与失败清理
- **`services/buildr/tools/verification/`** — 候选环境准备
  - [candidate-preparation-reuse.ts](../../services/buildr/tools/verification/candidate-preparation-reuse.ts) — 本机准备按输入及完整输出内容核验可重建回执（Receipt），输出缺失或变化只重做相关操作；持续集成（CI）默认保留干净安装
  - [candidate-environment.ts](../../services/buildr/tools/verification/candidate-environment.ts) — 唯一准备入口即时保存准备状态，按档位（Profile）安装实际运行依赖；`frontend` 提供前端测试输入，`browser-artifact` 提供测试运行时（Runtime）和明确 Chromium，均不替代候选网页载荷

## 上下文复用：公共能力与项目适配

公共运行时（Runtime）不依赖 Buildr 工作空间（Workspace）或测试路径选择；Buildr 提供者（Provider）在其上组织应用端口恢复、不可变准备和逐案例隔离。具体生存范围、缓存身份和接入方式见[专题说明](../docs/guides/node-test-context-runtime.md)。

- **`services/buildr/src/infrastructure/testing/context-runtime/`** — 公共上下文运行时（Test Context Runtime）
  - [public.ts](../../services/buildr/src/infrastructure/testing/context-runtime/public.ts) — 闭合公共导出，供包入口消费
  - [definition.ts](../../services/buildr/src/infrastructure/testing/context-runtime/definition.ts) — 定义、配置规范化和身份生成
  - [runtime.ts](../../services/buildr/src/infrastructure/testing/context-runtime/runtime.ts) — 缓存、依赖、取得、归还、污染失效和销毁
  - [node-test.ts](../../services/buildr/src/infrastructure/testing/context-runtime/node-test.ts) — 注册适配及直接执行单文件的生命周期
  - [node-runner.ts](../../services/buildr/src/infrastructure/testing/context-runtime/node-runner.ts) — 在外层额度内启动持久工作进程（Worker Host）并汇总结果
- **`services/buildr/test/context/`** — Buildr 专用准备与隔离
  - [dispositions.ts](../../services/buildr/test/context/dispositions.ts) — 每个步骤采用复用、混合或完整生命周期的理由
  - `providers/`
    - [task-application.ts](../../services/buildr/test/context/providers/task-application.ts) — 应用组装复用、共享端口恢复与案例工作空间（Workspace）
    - [task-lifecycle.ts](../../services/buildr/test/context/providers/task-lifecycle.ts) — 任务测试所需不可变基础准备
    - [prepared-fixtures.ts](../../services/buildr/test/context/providers/prepared-fixtures.ts) — 工作空间（Workspace）、项目（Project）与 Git 准备内容及独立副本

## 前端与产品行为：从要证明的结果定位测试

四服务完整单元测试（Unit Test）由 `services/buildr` 的 `npm test` 聚合；`npm run check` 覆盖推送前全部静态检查（Static Check）与单元测试（Unit Test）。另外提供 `test:static`、`test:integration`、`test:e2e` 和 `test:related`，所有入口均可通过 `--plan` 查看集合、`--check <id>` 显式指定检查。相关选择不要求正式任务或先有比较基线；已知具体检查可直接指定，选择完整性仍由智能体（Agent）对照目标判断。原包消费与准确双包验证保留其实际环境要求，不构成第五类。各入口范围见[产品测试架构](../docs/architecture/verification-framework.md#公开入口)。

- **`services/buildr-web/test/`** — 前端逻辑的独立测试集合
  - [parentCoordination.test.mjs](../../services/buildr-web/test/parentCoordination.test.mjs) — 父任务确认的默认拒绝、子任务处置和版本保留，不启动网页
- **`services/buildr-web/tools/`** — 前端验证入口
  - [run-logic-tests.mjs](../../services/buildr-web/tools/run-logic-tests.mjs) — `npm test` 与 `frontend-logic` 共用的完整测试驱动（Test Runner），明确传递工作进程预算（Worker Budget）并发现全部 `test/*.test.mjs`；独立调用默认 1 个工作进程（Worker）
- **`services/buildr/test/`** — 产品技术边界及真实旅程
  - `unit/`
    - [verification-changed-paths.test.ts](../../services/buildr/test/unit/verification-changed-paths.test.ts) — 受影响路径必须选中必要步骤，选择成功与实际测试通过分别核对
  - `static/`
    - [verification-entrypoints.test.ts](../../services/buildr/test/static/verification-entrypoints.test.ts) — 测试族（Testing Family）的完整入口与声明范围对应，包括四服务及四类检查的完整范围
  - `integration/`
    - [project-verification-map.test.ts](../../services/buildr/test/integration/project-verification-map.test.ts) — 多服务位置解析、局部不可用诊断、版本冲突与安全保存，不执行用户声明的测试
    - [application-payload-source.test.ts](../../services/buildr/test/integration/application-payload-source.test.ts) — 源码构建、载荷确定性及受控进程边界，进入源码完整集成检查
    - [application-payload-artifact.test.ts](../../services/buildr/test/integration/application-payload-artifact.test.ts) — 准确原包的文件与公共测试导出协议，消费候选包
    - [node-test-context-host.test.ts](../../services/buildr/test/integration/node-test-context-host.test.ts) — 持久工作进程（Worker Host）的上下文复用、额度与失败处理
  - `e2e/`
    - [application-payload-release.test.ts](../../services/buildr/test/e2e/application-payload-release.test.ts) — 准确原包安装、登记和实际用户命令及网页流程
    - [task-verification-product.test.ts](../../services/buildr/test/e2e/task-verification-product.test.ts) — 真实命令行（CLI）报告登记与读取，以及被拒绝写入的错误投射
    - [buildr-web-browser.test.ts](../../services/buildr/test/e2e/buildr-web-browser.test.ts) — 隔离服务、浏览器（Browser）和测试现场的组装、选择与清理
    - [workbench-journey.ts](../../services/buildr/test/e2e/workbench-journey.ts) — 实际页面回应、并发冲突后的重读保存、偏好恢复与资料阅读旅程

跨平台编排由仓库根 `.github/workflows/verify.yml` 消费 `candidate-ci.ts` 和 `registry.ts` 的检查归属与宿主组合。通用源码与原包检查本机执行一次，平台源码与平台原包分别由本机系统和 GitHub 另一系统提供真实证明；最低 Node 要求仍按实际执行满足。历史分片名称中的 `macos` 不再代表通用检查只能在 macOS 执行，实际归属以 `platformScope` 为准。汇总由 `candidate-ci-evidence.ts` 核验原包、源码、环境与原始来源；同轮普通本机日志可用于接续已有成功，不能代替另一平台或尚未执行的原包检查。`main` 候选仍执行来源校验，不支持来源不能因跳过取得成功。

## 测试源码检查与按边界执行

- [tsconfig.tests.json](../../services/buildr/tsconfig.tests.json) 与 [run-types.ts](../../services/buildr/tools/testing/run-types.ts) 检查主体、网页及智能体的 TypeScript 测试和辅助脚本；生产源码继续使用各服务自己的编译配置。
- [check-test-types.ts](../../services/dsh-plugin/tools/testing/check-test-types.ts) 使用准确的软件开发工具包（SDK）与真实生成协议，按入口隔离插件宿主端和客户端类型；不以空类型替代依赖。
- 资产目录的真实事务按初始化、关系、登记及代码库变更拆分，保留全部案例并可受控并行。公共命令行完整流程由 `e2e-workspace-assets` 执行；安装后连接与核心规则升级由 `application-payload-release` 消费同一冻结原包，避免重复制包。

## 低成本内部规则与页面流程

- [source-control-selection.ts](../../services/buildr-web/src/features/code/source-control-selection.ts) 承担任务入口、显式用户选择与已观察来源的优先级判断，由页面工作台调用并由无服务器单元测试直接验证。
- [source-control-row-density.ts](../../services/buildr-web/src/features/code/components/source-control-row-density.ts) 只计算测量值对应的逐级展示；行组件继续拥有 DOM 测量与真实交互，计算边界由单元测试覆盖。
- 文件浏览与源代码管理分别由 `e2e-browser:code-explorer`、`e2e-browser:code` 选择。源码浏览器检查共享不可变构建，各自创建临时现场，独立资源限制允许最多两个检查并行；真实 Git 与 HTTP 矩阵仍由现有集成入口执行。
