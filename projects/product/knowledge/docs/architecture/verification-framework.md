# 采用实例：Buildr 产品的测试与验证

本页解释 Product 的验证职责和入口。通用规则见[完整验证框架](workspace-testing-and-verification-framework.md)，实际声明见[项目测试地图](../../../verification.yml)，文件定位见[实例工具地图](../../code-map/product-verification-tools.md)。路径除注明外相对于 `services/buildr/`。

## 从项目地图到执行工具

| 责任 | 唯一主要位置 |
| --- | --- |
| 发现与分组 | `test-files.ts`、`system-suites.ts`、`registry.ts` |
| 改动归属 | `ownership.ts`：选择、排除、委托及扩大范围的理由 |
| 检查定义与选择 | `registry.ts`、`planner.ts`：步骤、依赖、范围和预算 |
| 执行与资源 | `plan-runner.ts`、`dag-scheduler.ts`、`executor.ts`、`resource-coordinator.ts` |
| 输入、复用与耗时 | `verification-source-inputs.ts`、`verification-inputs.ts`、`verification-reuse.ts`、`timing/` |
| 原包补验及汇总 | `candidate-repair.ts`、`candidate-repair-cli.ts`、`candidate-ci-evidence.ts` |
| 正式任务报告 | 通用任务验证（Task Verification）只消费真实摘要，不接管测试执行 |

上述文件位于 `test/verification/`。地图用于发现稳定入口，具体测试和资源以这些工具为准。

## 测什么，以及一次通过能说明什么

后端在 `services/buildr` 使用 `tools/development/run-development-npm run <脚本>`。稳定版 Node 要求 `>=24.15.0`；持续集成（CI）使用当前 24.x，最低版本另做轻量兼容检查。

| 需要证明什么 | 入口 | 边界 |
| --- | --- | --- |
| 日常改动 | `test:changed`；先看选择用 `-- --plan` | 按影响选择，附加必要低成本前置检查 |
| 低成本／日常完整后端 | `test:fast`、`test:core` | 不等于前端、原包或跨平台完整候选 |
| 定向检查 | `test:focus -- <step-id>` | 只运行选定步骤及真实依赖 |
| 发布前本机源码 | `test:source -- --output <bundle.json>` | 补齐当前平台源码证明，不打最终包；`--json` 看计划 |
| 前端逻辑 | 前端目录 `../buildr/tools/development/run-development-npm test` | 覆盖逻辑，不证明页面交互 |
| 页面交互 | `test:browser:changed`、`test:browser:smoke` | 真实浏览器（Browser）检查；构建成功不能替代 |
| 本机候选 | `test:candidate` | 当前机器的完整登记集合、原包及核心页面旅程 |
| 跨平台候选 | `verify.yml` → `candidate-ci.ts` | 聚合源码、平台、唯一包和宿主证明，不代表公开成功 |
| DSH 插件 | 插件目录 `node tools/verify-all.ts` | 独立构建、逻辑、同场装载及真实加载器；不代表用户桌面已更新 |

需要直接定位时仍可使用 `test:unit`、`test:component`、`test:contract`、`test:integration`、`test:system`。每个入口的“完整”仅指其登记范围；后端、前端逻辑、页面交互、安装环境和独立插件不能相互替代。

## 本机与远端各证明什么

| 内容 | 证明责任 |
| --- | --- |
| 通用功能、任务与工作目录、恢复、适配器、六组发布工具检查 | macOS 源码主证明，候选核验并复用本机结果 |
| Windows 命令、路径别名、链接、硬链接锁和进程树清理 | `system-windows-platform` 的最小用例，含一个 Git／CRLF 案例 |
| 原包快捷方式、安装、启动及退出 | 两系统的真实原包消费者 |
| 最低／当前 Node | 两系统轻量安装运行链路，不重复功能矩阵 |

真实系统依赖、具体风险及开发触发输入以[平台清单](../../../services/buildr/test/verification/platform-boundaries.ts)为准。源码与包消费分片（Shard）分开；没有平台依据不能默认加入 Windows，包消费分片不能混入通用源码检查。

本机有效结果可跳过对应远端检查和专属准备；尚未支持复用的检查继续执行。核对者的平台不能冒充原执行平台，空选择、跳过或计划成功也不是测试通过。完整职责与失败处理见[发布流程](../flows/open-source-release.md)。

本机复用与正式补验共用源码读取、范围及实际依赖选择。结果传递格式可以不同，适用性不另写一套；历史结果先核验原来源，再比较当前输入，保留原记录和真实执行时间。

## 新测试怎样接入

1. 选择能证明公共结果的最低充分边界，保留真实副作用及必要失败场景。
2. 接入实际文件发现：集成分组用 `INTEGRATION_PRIMARY_SLICES`，系统分组用 `SYSTEM_SUITES`；前端及浏览器使用各自入口。
3. 同时登记 `ownership.ts` 与 `registry.ts`；验证相关变更能选中它，完整集合无遗漏、无无意重复。
4. 核对依赖、隔离、资源和超时，再更新已有项目地图；不因增加一个文件创建新流程。

## 环境与状态隔离

[测试上下文运行时](../guides/node-test-context-runtime.md)复用昂贵组装和不可变准备，案例状态继续隔离。处置由 `test/context/dispositions.ts` 声明，内层进程遵守外层授予的并发额度。

工作空间（Workspace）的命令行（CLI）和 HTTP 检查须经 `tools/development/run-isolated-workspace-smoke.ts`，同时隔离工作目录、`BUILDR_APP_DATA_DIR`、`BUILDR_PRODUCT_DATA_DIR`，成功失败均清理。测试不得进入用户真实应用状态。

源码页面检查使用隔离构建；候选页面检查使用唯一压缩包内网页，不能重建替换。完整初始化、恢复、卸载及清理保留真实生命周期，不因复用夹具而省略。

## 证据如何支持交付

| 输入或结果 | 处理 |
| --- | --- |
| 内容、配方、依赖、必要环境一致且完整成功、清理干净 | 复用，保留原时间与来源；`--force` 可强制执行 |
| 当前检查、实际依赖或共享执行行为变化 | 对应结果失效 |
| 独立系统集合的其他文件只改内容 | 不撤销本集合；发现成员新增／删除仍需核验 |
| 读取不明确或计算导入 | 保守扩大范围，显示未解析项 |
| 执行期间输入漂移、失败或清理不全 | 不保存可复用成功，保留真实失败事实 |
| 原包补验 | 分别绑定产包源码和验证源码，保留原字节；不赋予补验代码发布权限 |

选择路径用于决定“该测什么”，不是完整读取范围。系统输入由真实分组生成，静态依赖可追踪；动态读取、前端和 DSH 的部分输入仍较宽，不能宣称所有局部修复都已精准复用。实际读取 Git 的检查仍核对当前 Git；其他隔离仓库用例不绑定无关任务引用。

报告分别保存准备、排队、执行、断言、超时及清理耗时。时限和资源预算用于定位长尾，不靠无限加时掩盖问题；不能将不同集合的计数或耗时直接比较。正式任务报告、候选聚合、代码交付与公开发布分别陈述。

## OpenSpec 工具依赖风险

现有记录保留 OpenSpec 1.13.0 的开发依赖链 `fast-glob → micromatch → braces` 风险，见[官方公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。生产依赖、项目开发依赖及外部安装须分别审计；当前内置模式未证明存在完整触发路径，也不等于风险已修复。按既有决定暂缓处理，不执行破坏性降级或隐去警报；升级时重新核对实际依赖与能力。
