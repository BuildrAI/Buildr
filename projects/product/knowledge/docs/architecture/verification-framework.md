# 采用实例：Buildr 产品的测试与验证

Buildr 产品自身是在通用框架下建设测试能力的一个项目实例。它把测试建设、选哪些检查、怎样执行、怎样消费证据分开。通用工作方式见[完整验证框架](workspace-testing-and-verification-framework.md)；本文只解释 `product` 项目（Project）的真实实现。路径除注明外相对于 `services/buildr/`，定位入口见[实例工具地图](../../code-map/product-verification-tools.md)。

## 从项目地图到执行工具

[项目测试地图](../../../verification.yml)目前有六个测试族（Testing Family）：`buildr-fast`、`buildr-functional`、`buildr-system`、`buildr-web-unit`、`buildr-web` 和 `buildr-environment-smoke`。前三项负责后端与工程检查；`buildr-web-unit` 负责前端逻辑；`buildr-web` 负责构建及真实页面交互；最后一项用于明确目标环境中的安装与运行检查。地图供智能体（Agent）发现稳定入口，具体文件发现、路径归属、步骤和资源另由项目工具维护。

| 责任 | 唯一主要位置 | 产生什么 |
| --- | --- | --- |
| 发现测试与分组 | `test/verification/test-files.ts`、`system-suites.ts`、`registry.ts` | 真实文件集合、系统分组及集成分片 |
| 解释改动归属 | `test/verification/ownership.ts` | 路径匹配、排除、委托及必须扩大范围的原因 |
| 定义检查步骤 | `test/verification/registry.ts` | 步骤身份、执行器（Executor）、依赖、分类、资源需求和预算 |
| 选择和校验 | `test/verification/planner.ts` | 受影响范围（affected）或完整范围（full）、选择理由与预算判断 |
| 执行与协调 | `plan-runner.ts`、`dag-scheduler.ts`、`executor.ts`、`resource-coordinator.ts` | 按依赖和实际资源额度运行，汇总真实结果 |
| 诊断与耗时 | `test/verification/timing/` | 等待、执行、清理、失败及来源身份 |
| 报告消费 | 通用任务验证（Task Verification） | 智能体（Agent）把适用执行摘要纳入正式报告 |

项目执行计划（Verification Plan）和有向无环图（DAG）属于这些测试工具。通用任务验证应用层（Task Verification Application）不生成它们，也不接管它们的日志或资源。

## 测什么，以及一次通过能说明什么

Buildr 的验证由以下几部分共同组成。**某个入口的“完整”只相对于它声明的集合**，不能把后端、前端逻辑、页面交互和跨平台候选相互替代。

下表的工作目录均相对于 `projects/product/`。后端命令用 `tools/development/run-development-npm run <脚本名>`；前端使用表内给出的相邻服务包装入口（Wrapper），两者都采用项目声明的精确 Node.js 版本。

| 测试对象 | 真实入口与工作目录 | 证明范围及独立检查 |
| --- | --- | --- |
| 后端行为与工程约束 | 在 `services/buildr` 执行 `test:fast`、`test:integration`、`test:system`；日常较大范围用 `test:daily-full` | 分别检查类型与静态边界、细粒度行为、真实技术集成、完整公共入口及恢复。`test:daily-full` 执行注册表的 `core` 集合；不自动运行前端逻辑或浏览器（Browser）旅程，也不等于完整候选 |
| 前端逻辑 | 在 `services/buildr-web` 执行 `../buildr/tools/development/run-development-npm test`，对应 `buildr-web-unit` | 运行 `test/*.test.mjs`，检查输入转换、筛选、分页等逻辑；不启动浏览器（Browser），不证明页面已正确呈现或可交互 |
| 前端构建与真实页面旅程 | 在 `services/buildr` 执行 `test:browser:smoke`；按改动选择用 `test:browser:changed`，对应 `buildr-web` | 准备隔离构建产物并验证页面与后端协作；不执行前端 `test/*.test.mjs`。单独构建可在 `services/buildr-web` 执行 `../buildr/tools/development/run-development-npm run build`，但构建成功没有交互证明 |
| 本机候选（Candidate） | 在 `services/buildr` 执行 `test:candidate`，由 `candidate.ts` 选择 `candidate` 集合 | 在当前机器检查源码、生成唯一压缩包并运行适用发布物检查；不产生其他平台结果，也不包含独立的前端逻辑和浏览器（Browser）旅程 |
| 跨平台候选（Candidate）聚合 | 仓库根 `.github/workflows/verify.yml` 调用 `candidate-ci.ts` 的 `plan`、`run`、`host`、`aggregate` | 组织源码分片、单一发布物、macOS/Windows 平台检查和 macOS/Windows/Linux 宿主 Node.js（Host Node）组合；聚合校验来源、登记和发布物身份。当前集合同样未纳入前端逻辑和浏览器（Browser）旅程；其通过不等于整个产品或发布已成功 |
| 明确目标环境中的实际运行 | `buildr-environment-smoke` 给出按目标执行的指导，无固定全局命令 | 检查指定安装或发布环境中的命令行（CLI）、HTTP 或页面入口；只证明实际观察到的环境和行为，不用开发目录测试替代它 |

[后端脚本](../../../services/buildr/package.json)、[前端脚本](../../../services/buildr-web/package.json)、[执行注册表](../../../services/buildr/test/verification/registry.ts)、[本机候选入口](../../../services/buildr/test/verification/candidate.ts)和[跨平台候选入口](../../../services/buildr/test/verification/candidate-ci.ts)共同限定上述范围。`dev` 拉取请求的持续集成（CI）还会按受影响路径单独选择浏览器（Browser）检查；这与跨平台候选聚合是不同作业，不能据前者推断后者已覆盖。

日常定向检查可用 `test:focus -- <step-id>`，用 `test:changed -- --plan` 查看选择及理由，再由 `test:changed` 执行。后者会为选中步骤组合 `fast` 前置检查，关键执行依据变化时扩大到日常完整集合。纯知识修改可选文档质量步骤并补阅读验收。选择预览、类型检查、构建、`coverage:unit` 覆盖率各自提供不同证据，不能互相冒充实际行为测试。

## 真实用例怎样证明产品行为

下面列出六个现有例子，帮助理解测试对象和技术边界；链接是测试定义，不表示当前版本已经执行通过。

| 用例与来源 | 在什么边界观察什么 | 证明的限制 |
| --- | --- | --- |
| [源码变化选中必要回归](../../../services/buildr/test/unit/verification-changed-paths.test.ts) | 对测试地图模块的应用、领域、命令行（CLI）和装配路径分别规划，断言选中 `integration-declarations` | 证明选择规则没有漏掉这些路径；被选测试仍需实际执行 |
| [多服务测试地图解析与安全保存](../../../services/buildr/test/integration/project-verification-map.test.ts) | 使用真实临时目录和项目、服务、代码库登记，验证外部服务目录解析、不可用位置隔离、版本冲突和写入失败保留原文件 | 证明地图维护和位置诊断；不执行地图中声明的用户测试 |
| [正式报告的命令行登记与读取](../../../services/buildr/test/system/task-verification-product.test.ts) | 通过真实命令行（CLI）进程保存报告，再读取并核对内容身份适用性；另测候选写入被拒绝时的错误投射 | 证明报告入口与身份边界；示例报告中的 `passed` 是测试输入，不是替用户执行测试 |
| [父任务完成表单的确认规则](../../../services/buildr-web/test/parentCoordination.test.mjs) | 直接调用前端输入转换，确认默认未授权、缺少确认或子任务处置时拒绝，合法输入保留已观察版本 | 证明前端逻辑；不能代替真实表单点击或后端并发校验 |
| [工作台回应冲突后的重读与保存](../../../services/buildr/test/browser-smoke/workbench-journey.ts) | 在真实页面输入答复，制造其他入口更新，观察 HTTP 409、保留输入、重读再保存，并核对任务记录未被改写 | 证明该页面、接口和持久化共同完成的旅程；不是全部页面或全部并发场景的证明 |
| [压缩包离线安装后运行命令行与网页](../../../services/buildr/test/integration/application-payload-release.test.ts) | 安装实际候选（Candidate）压缩包，在隔离目录运行命令行（CLI），再按需启动网页并核对健康与发布物身份 | 证明被安装压缩包在本次宿主上的行为；跨平台结论还需各平台对应证据 |

这些例子展示从纯逻辑、技术集成、公共入口到真实页面和发布物的不同边界。新增测试应先选择能捕获目标错误的边界，再决定目录、夹具（Fixture）和运行方式，不根据文件名机械判断证明强度。

## 新测试怎样接入

先确认待证明结果与最低充分边界，再同时核对两件事：**完整入口发现它，相关源码变化也能选择它。** 新文件存在、能单独运行或碰巧被单元集合覆盖，都不足以证明第二件事。

1. 在最接近事实责任主体（Owner）的测试目录增加案例，复用适用夹具（Fixture）。
2. 核对所属入口的文件发现方式。后端集成分片由 `INTEGRATION_PRIMARY_SLICES` 与排除集协作，系统测试（System）由 `SYSTEM_SUITES` 维护分组；前端逻辑由前端包的 `test/*.test.mjs` 发现，页面旅程由浏览器（Browser）选择器接入。
3. 后端步骤在 `ownership.ts` 核对路径影响，页面旅程核对 `browser-selector-dispatcher.ts` 的选择结果；前端逻辑按测试地图与改动选择现有测试。修改选择机制时也要验证其自身。
4. 确需新增稳定步骤时，再维护 `registry.ts` 中的执行器（Executor）、分类、真实依赖、预算和资源，以及 `test/context/dispositions.ts` 的处置。
5. 用实际测试取得行为证据，再用选择预览确认必要步骤被选中；预览本身不算测试通过。
6. 只有稳定入口、测试族（Testing Family）的范围或环境变化，才交给声明接入（declaration-intake）和任务验证（task-verification）维护 `verification.yml`。

## 执行依赖与资源

执行注册表（Registry）描述主要证明责任（`primaryEvidenceOwner`）、公共结果、真实技术边界、目标耗时与副作用。重复辅助检查可以存在，但不能把同一事实包装成多份独立主要证明。

依赖图（DAG）负责等待真实前置结果；执行入口还组合其明确要求的低成本前置检查。调度器（Scheduler）同时考虑步骤类别、具名资源和 `workers/processes/git/workspaceIo` 容量。执行器（Executor）把实际授予额度传给子进程并发或持久工作进程（Worker Host），内层不能自行扩大额度。

未知步骤、无效配置、必要依赖缺失或不可满足资源会在相关执行开始前失败。路径选择的成功状态只证明规则匹配通过，不证明待验证的公共行为或测试覆盖已经充分。

## 环境与状态隔离

[测试上下文运行时](../guides/node-test-context-runtime.md)复用昂贵应用组装或不可变准备内容，同时保留逐案例隔离。公共实现位于 `src/infrastructure/testing/context-runtime/`，Buildr 专用提供者（Provider）位于 `test/context/providers/`。

三种处置由 `test/context/dispositions.ts` 维护：`context-runtime` 由公共运行时（Runtime）管理复用和隔离，`hybrid` 保留真实文件、数据库或进程边界，`full-lifecycle` 保留被测完整生命周期或无可复用状态的检查。复用不改变测试的真实边界。

工作空间（Workspace）命令行（CLI）及 HTTP 冒烟必须经 `tools/development/run-isolated-workspace-smoke.ts`：同时隔离工作目录、`BUILDR_APP_DATA_DIR` 和 `BUILDR_PRODUCT_DATA_DIR`，成功或失败后均清理。不能让测试进入真实用户应用状态。

前端服务（Service）负责 React/Vite 源码和构建；后端服务（Service）托管正式 `web-dist`。浏览器（Browser）验证使用隔离构建产物，页面逻辑的 `buildr-web/test/*.test.mjs`、类型检查或构建不能替代真实交互。浏览器（Browser）选择细节见 `browser-selector-dispatcher.ts`，关键页面旅程在 `test/browser-smoke/`。

## 证据如何支持交付

日常执行保留实际结果、选择理由、来源身份、排队与资源等待、执行和清理耗时；上下文（Context）执行另记录创建、复用、取得、重置、污染失效和销毁。这些帮助定位失败与性能，属于测试工具的临时证据，不能冒充正式任务完成或发布成功。

跨平台候选（Candidate）由[证据聚合实现](../../../services/buildr/test/verification/candidate-ci-evidence.ts)核对所需分片与宿主组合是否齐全、是否来自相同源码及登记身份、是否消费同一压缩包；缺失或身份不符会使聚合失败。本机 `test:candidate` 的结果不能替代这份聚合。正式任务报告仍须分别说明所需的前端逻辑、浏览器（Browser）旅程及目标环境检查是否实际完成。发布（Release）还涉及当前外部权限、真实发布与回读，流程和恢复由[开源发布说明](../flows/open-source-release.md)单独维护。`integration-candidate-release` 是发布专用证据，不默认纳入日常 `core`。

后续优化先依据当前耗时找出选择放大、重复准备、执行体或清理瓶颈。不能为追求速度删除正在证明的安装、初始化、迁移、恢复、平台或发布物边界。历史数字保留在[验证证据审计](../../../docs/verification-evidence-audit.md)，不代表当前运行结果。
