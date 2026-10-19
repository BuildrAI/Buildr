# 采用实例：Buildr 产品测试工具地图

Buildr 产品是[通用项目与服务测试验证框架](../docs/architecture/workspace-testing-and-verification-framework.md)的一个采用实例。本图定位它自己的测试选择、执行、前端检查、候选聚合和上下文复用实现；这些工具不构成用户项目的必需技术栈。通用方法及软件支持见[通用框架实现地图](verification-framework.md)。

产品路径相对于 `projects/product/`；发布技能（Skill）脚本位于工作空间根的 `skills/buildr-release/`。发布主线见[唯一发布说明](../docs/flows/open-source-release.md)。本实例的稳定入口和准备方式见[产品测试地图](../../verification.yml)、[准备声明](../../preparation.yml)，职责与限制见[产品测试架构](../docs/architecture/verification-framework.md)。

## 产品测试工具：发现、选择、执行

这些文件服务 Buildr 产品自己的工程验证。`changed.ts` 收集差异后调用规划器（Planner），组合前置检查并将执行交给 `executePlan()`；后者通过依赖调度和执行器（Executor）调用真实工具。依赖方向是项目工具消费测试及公共技术能力，不是通用项目地图模块反向执行这些脚本。

- **`services/buildr/test/verification/`** — 产品自己的测试编排
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
  - [system-suites.ts](../../services/buildr/test/verification/system-suites.ts) — 系统测试（System）分组、实际文件和有关资源
  - [ownership.ts](../../services/buildr/test/verification/ownership.ts) — 改动路径归属、排除项、委托与扩大范围的依据
  - [registry.ts](../../services/buildr/test/verification/registry.ts) — 稳定步骤、职责分片、通用／平台归属、主要证明责任、真实工作进程额度及候选分片；平台归属与运行场所分别声明
  - [platform-boundaries.ts](../../services/buildr/test/verification/platform-boundaries.ts) — macOS 与 Windows 原生命令、路径／锁、文件描述符／进程及原包启动器的具体机制与最小断言；不以系统名称复制通用功能
  - [planner.ts](../../services/buildr/test/verification/planner.ts) — 校验步骤与预算，选择范围并给出原因，组合低成本前置检查
  - [changed.ts](../../services/buildr/test/verification/changed.ts) — 日常受影响范围（affected）的预览或执行入口
  - [focus.ts](../../services/buildr/test/verification/focus.ts) — 显式步骤、分组及目录查看入口
  - [plan-runner.ts](../../services/buildr/test/verification/plan-runner.ts) — 一次执行的准备、资源协调、调度与汇总
  - [dag-scheduler.ts](../../services/buildr/test/verification/dag-scheduler.ts) — 依赖、并发类别、具名资源和数字容量的调度
  - [executor.ts](../../services/buildr/test/verification/executor.ts) — 将步骤和实际额度转成具体子进程调用
  - [resource-coordinator.ts](../../services/buildr/test/verification/resource-coordinator.ts) — 同机多次执行间的共享资源协调
  - [candidate.ts](../../services/buildr/test/verification/candidate.ts) — 本机日常完整或候选（Candidate）集合入口；只执行当前机器上的注册步骤
  - [candidate-ci.ts](../../services/buildr/test/verification/candidate-ci.ts) — 按有效证明选择跨平台源码／原包缺项，执行宿主 Node.js（Host Node）组合并汇总；全部必需源码通过后才进入产包
  - [candidate-ci-evidence.ts](../../services/buildr/test/verification/candidate-ci-evidence.ts) — 检查证据齐全性以及源码、登记、作业和唯一压缩包身份
  - [candidate-repair.ts](../../services/buildr/test/verification/candidate-repair.ts) — 同轮原包补验保留成功、只补失败及缺项；核对原字节、真实平台和最低宿主，保留原始来源
  - [candidate-repair-cli.ts](../../services/buildr/test/verification/candidate-repair-cli.ts) — 受控原运行、真实包读取，生成缺项矩阵及保留证据；采用不变 DSH 原包与精确对端证明
  - [browser-selector-dispatcher.ts](../../services/buildr/test/verification/browser-selector-dispatcher.ts) — 选择页面检查，准备隔离 `web-dist`，通过隔离执行器（Runner）启动浏览器（Browser）测试
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
  - [run-isolated-workspace-smoke.ts](../../services/buildr/tools/development/run-isolated-workspace-smoke.ts) — 隔离工作目录和两类应用数据目录，统一成功与失败清理
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

前端逻辑测试由 `services/buildr-web/package.json` 的 `test` 执行，`frontend-logic` 在前端受影响路径和完整候选（Candidate）中调用它。源码浏览器（Browser）旅程由后端 `test:browser:smoke` 或 `test:browser:changed` 执行；完整候选（Candidate）另由 `artifact-browser-core` 消费唯一压缩包内的网页载荷执行核心旅程，不证明全部页面。后端 `test:daily-full` 继续只声明日常后端范围。`dsh-plugin` 在插件受影响路径调用独立完整验证，不进入主包候选集合。各入口的工作目录与覆盖边界见[产品测试架构](../docs/architecture/verification-framework.md#当前入口)。

- **`services/buildr-web/test/`** — 前端逻辑的独立测试集合
  - [parentCoordination.test.mjs](../../services/buildr-web/test/parentCoordination.test.mjs) — 父任务确认的默认拒绝、子任务处置和版本保留，不启动网页
- **`services/buildr-web/tools/`** — 前端验证入口
  - [run-logic-tests.mjs](../../services/buildr-web/tools/run-logic-tests.mjs) — `npm test` 与 `frontend-logic` 共用的完整测试驱动（Test Runner），明确传递工作进程预算（Worker Budget）并发现全部 `test/*.test.mjs`；独立调用默认 1 个工作进程（Worker）
- **`services/buildr/test/`** — 产品技术边界及真实旅程
  - `unit/`
    - [verification-changed-paths.test.ts](../../services/buildr/test/unit/verification-changed-paths.test.ts) — 受影响路径必须选中必要步骤，选择成功与实际测试通过分别核对
  - `contract/`
    - [verification-entrypoints.test.ts](../../services/buildr/test/contract/verification-entrypoints.test.ts) — 测试族（Testing Family）的完整入口与声明范围对应，包括集成、系统和前端的独立入口
  - `integration/`
    - [project-verification-map.test.ts](../../services/buildr/test/integration/project-verification-map.test.ts) — 多服务位置解析、局部不可用诊断、版本冲突与安全保存，不执行用户声明的测试
    - [application-payload-release.test.ts](../../services/buildr/test/integration/application-payload-release.test.ts) — 载荷构造夹具及真实原包的离线安装、宿主运行和按需网页边界；部分夹具不消费最终原包
    - [node-test-context-host.test.ts](../../services/buildr/test/integration/node-test-context-host.test.ts) — 持久工作进程（Worker Host）的上下文复用、额度与失败处理
  - `system/`
    - [task-verification-product.test.ts](../../services/buildr/test/system/task-verification-product.test.ts) — 真实命令行（CLI）报告登记与读取，以及被拒绝写入的错误投射
  - `browser-smoke/`
    - [buildr-web-browser.test.ts](../../services/buildr/test/browser-smoke/buildr-web-browser.test.ts) — 隔离服务、浏览器（Browser）和测试现场的组装、选择与清理
    - [workbench-journey.ts](../../services/buildr/test/browser-smoke/workbench-journey.ts) — 实际页面回应、并发冲突后的重读保存、偏好恢复与资料阅读旅程

跨平台编排由仓库根 `.github/workflows/verify.yml` 消费 `candidate-ci.ts` 和 `registry.ts` 的检查归属与宿主组合。通用源码与原包检查本机执行一次，平台源码与平台原包分别由本机系统和 GitHub 另一系统提供真实证明；最低 Node 要求仍按实际执行满足。历史分片名称中的 `macos` 不再代表通用检查只能在 macOS 执行，实际归属以 `platformScope` 为准。汇总由 `candidate-ci-evidence.ts` 核验原包、源码、环境与原始来源；同轮普通本机日志可用于接续已有成功，不能代替另一平台或尚未执行的原包检查。`main` 候选仍执行来源校验，不支持来源不能因跳过取得成功。
