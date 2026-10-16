# Buildr 验证：现有检查与发布取舍

本页是 Buildr 产品验证的工程核对底稿，详细定位见[工具地图](../../code-map/product-verification-tools.md)，稳定入口见[验证声明](../../../verification.yml)及[准备声明](../../../preparation.yml)。[发布说明](../flows/open-source-release.md)只负责发布主线。**检查登记、代码调整和实际验收分别成立；下列清单不表示已执行或通过完整候选。**

## 先对齐分工

智能体（Agent）按 `buildr-release` 固定候选，再调用验证框架跑测试；发布脚本打包后，验证框架继续检查这个原包。发布专用代码位于工作空间根的 `skills/buildr-release/scripts/`，验证框架负责检查定义、选择、输入、结果复用、执行、环境和汇总。本机和 GitHub 使用同一份规则。

运行前应看见：必需项、有效旧结果、缺项、具体失效原因和预计耗时；运行后保留每项真实结果与来源，组合成完整覆盖。源码通过、原包可安装、候选完整、公开授权及官方公开分别成立；已调整行为与剩余边界见文末。

## 当前入口

在 `services/buildr` 使用 `tools/development/run-development-npm run <脚本>`；前端使用本服务包装入口从 `services/buildr-web` 调用。稳定 Node 要求 `>=24.15.0`，记录实际程序；不要求开发机器恰好使用最低版本。

| 需要什么 | 现有入口与边界 |
| --- | --- |
| 看改动该测哪些／定向执行 | `test:changed -- --plan`；`test:focus -- <step-id>`。选择成功不等于检查成功 |
| 日常快速／完整后端 | `test:fast`、`test:core`；不自动证明前端页面、最终原包或跨平台候选 |
| 发布前源码证明 | `test:source -- --json` 只看计划；`test:source -- --output <bundle.json>` 补当前平台源码缺项，不打最终包 |
| 前端逻辑／源码页面 | 前端 `npm test`；后端 `test:browser:changed`、`test:browser:smoke`。页面按选择器执行 |
| 当前机器候选／跨平台候选 | `test:candidate`；GitHub `verify.yml`。后者才组合平台、同一原包与宿主 Node 证据 |
| 独立插件 | 插件 `tools/verify-all.ts`，使用显式 Node、固定 SDK 和准确主包对端；详见下文 |

## 现有检查清单

按当前任务树登记核对，共 **74 个步骤**（含产包步骤）、**16 个主包候选分组**、**4 个宿主 Node 组合**。这不表示每次发布都新跑 74 项；其中三项只属宿主计划、插件有独立路径，两个 OpenSpec 包装检查及 `runtime-skill-projection`／`repository-onboarding` 不在默认候选分组。

当前定义和证明内容来自 [registry.ts](../../../services/buildr/test/verification/registry.ts)，实际分组来自同文件的 `CANDIDATE_CI_SHARDS` 和 [verify.yml](../../../../../.github/workflows/verify.yml)；不能把本页变成另一份可执行登记。下表按检查内容分组；可用页面目录跳到相应小节。

读表约定：

- “可复用”还必须满足检查代码／成员／真实依赖、执行方式与该项工作额度、必要环境／工具／平台、完整成功和清理均有效，输入执行期间没有变化，保留原来源及时间。下面的共享准备不等于共享可变业务数据。
- 当前内容范围：**后端**包括后端、发布技能（Skill）及公共项目声明；**前后端**再含前端；**全仓**保守读取整个仓库；**运行范围**仅排除产品知识、规范和任务目录，仍很宽。Windows 的 `platform-backend` 保留后端运行／物化材料及公共声明，排除前端、插件和发布技能源。测试与发布／验证工具按实际入口和可解析依赖另入检查配方；未知读取保守扩大。详见[共享输入规则](../../../services/buildr/test/verification/verification-source-inputs.ts)和[读取发现](../../../services/buildr/test/verification/verification-inputs.ts)，不能当作已实现所有检查的精确窄范围。
- “GitHub 采用或补缺项”表示本机有适用结果即可采用；没有时仍执行该项，不意味着远端删掉检查。Windows 结果必须来自真实 Windows。
- `package-*` 和 `npm-launcher-candidate` 是源码与夹具检查，**不消费本次最终原包**。原包消费者须在产包之后；正式补验还要核对原字节及真实环境，普通源码成功不能替代。

### 源码静态、逻辑与声明（12 项）

| 检查 | 证明什么 | 当前在哪里跑 | 旧结果与重跑条件 | 能共享什么 | 讨论取舍 |
| --- | --- | --- | --- | --- | --- |
| `typecheck` | 生产／工具类型及生成契约一致；测试配置另有 noCheck，非全部测试严格类型检查 | 源码路径本机及 GitHub 新跑 | 源码缓存不复用；正式补验可核验采用匹配证明 | 依赖、生成物；无共享可变状态 | 源码先保留新跑；准备成本独立优化 |
| `unit` | 领域、任务、发布、验证、安装、连接及前端辅助函数的完整单元入口 | 本机 macOS；GitHub 采用或补缺项 | 可复用；前后端输入变化会失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `component` | 服务应用比较与版本更新；诊断／CLI 参数、输出和未知状态，使用替代依赖 | 本机 macOS；GitHub 采用或补缺项 | 可复用；后端输入变化会失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `contract` | 模块／接口／规则技能／任务／发布工作流／包兼容等源码及资源约定 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `frontend-logic` | 前端状态、导航、请求和转换逻辑；不启动浏览器 | 本机 macOS；GitHub 采用或补缺项 | 可复用；前后端输入变化会失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `cli-architecture` | 目录／模块依赖、薄 CLI 与包装入口、登记及技术说明的一致性 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `openspec-spec-quality` | 正式规格 Purpose 存在、非空且无占位；不评价全部规格语义 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `openspec-strict` | 上游程序 validate --all --strict；不复制上游校验逻辑 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `runtime-adapter-contract` | 适配器声明与投射计划、链接／冲突／组件边界，读取根说明 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `openspec-candidate-audit` | 以真实 Git 比较重放归档差量并匹配正式规格，拒绝未归档来源 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效，另绑 Git 比较 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `managed-mutations` | 生产源码文件写入集中到已审查的负责函数；静态分析 | 本机 macOS；GitHub 采用或补缺项 | 可复用；后端输入变化会失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `docs-quality` | Markdown 相对链接、仓库边界及任务引用格式；不判断正文业务语义 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入或 BUILDR_CHANGED_PATHS_JSON 检查子集变化失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |


### 集成测试和发布脚本自身检查（17 项）

| 检查 | 证明什么 | 当前在哪里跑 | 旧结果与重跑条件 | 能共享什么 | 讨论取舍 |
| --- | --- | --- | --- | --- | --- |
| `integration` | 未分入其他组的真实文件、Git、进程等跨域技术边界 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓产品输入仍保守；配方按 general 实际过滤成员及依赖 | 公共依赖；本项现场与清理独立 | 保留；专项成员不再仅因扫描目录纳入 |
| `integration-declarations` | 项目准备／验证声明的解析、诊断、保存与包登记边界 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-openspec` | 变更域、确定性同步、预检、投射校验、事务／失败恢复及上游调用 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-verification` | 测试地图、正式报告、选择／调度／复用／资源与完成边界 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-runtime` | 运行时、能力与网页载荷、观察、材料、HTTP 和投射的集成边界 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 不变种子；真实边界与数据隔离 | 保留；无完整重复证据 |
| `integration-release` | 安装登记／来源／身份、发布文件系统与 CLI 路由；不产生公开效果 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-data-store` | 真实 SQLite、迁移、管理写入围栏与任务快照隔离 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-self-bootstrap` | 隔离 Git 中唯一自举的同步、恢复、Node／入口和应用更新顺序；不等于本机正式激活 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-task-read-models` | 审查与任务读模型的版本冲突、历史、只读终态及回滚 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 应用组装；每案数据隔离 | 保留；无完整重复证据 |
| `integration-task-coordination` | 父子任务、产品内发布结果的 SQLite 版本与隔离；不是 npm 发布 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 应用组装；每案数据隔离 | 保留；无完整重复证据 |
| `integration-project-daily-progress` | 每日演进的观察范围、存储、汇总和失败边界 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 应用组装；每案数据隔离 | 保留；无完整重复证据 |
| `integration-candidate-release` | 发布输入／包观察／权限／冷启动／逐包操作／恢复等 14 个文件；受控外部效果 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-candidate-release-selection` | 冻结引用、源码基线、代次、重新选择与 main 来源 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-candidate-package-selection` | 独立包版本、对端、准备采用与禁止重复派发 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-candidate-release-effects` | 部分 Git／Registry 效果恢复，禁止重复公开或抹掉成功事实 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-candidate-git-convergence` | 发布承载引用、代次清理、准确提交与公开来源保全 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `integration-candidate-git-selection` | 同树 main 纳入和恢复，保留独立 dev 历史及漂移现场 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |


### 公共入口、进程与工作目录（18 项）

| 检查 | 证明什么 | 当前在哪里跑 | 旧结果与重跑条件 | 能共享什么 | 讨论取舍 |
| --- | --- | --- | --- | --- | --- |
| `system-verification-admission` | 真实改动选择入口的 Git 差异、插件路由与非法来源拒绝 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 不变种子；真实边界与数据隔离 | 保留；无完整重复证据 |
| `system-verification-contracts` | 公共验证入口的跨进程容量、排队、崩溃释放、耗时与失败现场保留 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `system-public-json-contracts` | 真实 CLI 各类公开 JSON 的版本、闭合结构和诊断输出 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `system-openspec-contract-audit` | 从公共入口证明正式规格与归档差量可重放、缺证拒绝和 Purpose 例外 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `system-workspace-lifecycle` | 工作空间／项目／服务的目录、UUID、分支、迁移、版本冲突与包能力退休 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 基础种子；真实生命周期独立 | 保留；无完整重复证据 |
| `system-task-lifecycle` | 公共 CLI／HTTP 的任务、提交、审查、验证报告及终态写边界 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 不变种子；真实边界与数据隔离 | 保留；无完整重复证据 |
| `system-worktree-lifecycle` | 真实 Git 工作树创建／去重／保全／清理、脏文件／锁／占用及部分恢复 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 基础种子；真实生命周期独立 | 保留；无完整重复证据 |
| `system-nested-git-isolation` | 非 Git 根下独立子仓库的公共操作、坏来源局部化、材料保留和链接越界 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `system-runtime-recovery` | 更新来源／载荷、投射权限、范围及旧 Node 声明和恢复 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `system-buildr-web-http` | 真实回环 HTTP、会话保护、版本冲突、文章、多工作空间及健康／退出 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 不变种子；真实边界与数据隔离 | 保留；无完整重复证据 |
| `system-app-process` | 真实网页／预览进程的重复启动、隔离、所有权、恢复、空格路径和退出 | 本机 macOS；GitHub 采用或补缺项 | 可复用；运行范围输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `system-windows-platform` | cmd／PATHEXT、路径别名／junction、硬链接锁、taskkill，另含一个真实 Git／CRLF 用例 | 真实 Windows（可本机或 GitHub） | 可复用；`platform-backend` 内容、实际成员／依赖及执行环境变化失效 | 公共依赖；本项现场与清理独立 | 保留原生最小集合，已收窄无关输入 |
| `concurrent-task-acceptance` | 受控进程重叠、双任务／工作树、预览归属与清理保护；没有启动两套真实测试或预览服务 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `workspace-lifecycle` | 源码 CLI 串联初始化、项目／服务、规则／命令／技能、同步与诊断 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `ownership-recovery` | 组件成员拒删、核心保护、可选技能卸载／恢复／同步与诊断 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `runtime-reconciliation` | 嵌套规则桥、不同适配器、组件源漂移拒绝与恢复 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `init-onboarding` | 真实新目录初始化、参数拒绝、首项目、幂等、缺项修复和冲突保留 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `managed-data-integrity` | 管理写入的原子性、用户修改／缺项保留、冲突零写入和嵌套 Git 保全 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |


### 源码资源、命令及适配器（17 项）

| 检查 | 证明什么 | 当前在哪里跑 | 旧结果与重跑条件 | 能共享什么 | 讨论取舍 |
| --- | --- | --- | --- | --- | --- |
| `npm-launcher-candidate` | 源码安装登记、启动器投射、身份漂移／修复／归属；部分平台行为用替身 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `capability-cli-integration` | 真实 CLI 的能力安装／替换／绑定／恢复、项目覆盖与冲突零写入 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `commands-cli-integration` | 真实 CLI 的命令目录／项目要求／本机观察、组合约束和反向引用保护 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `openspec-contract-fixtures` | 包装 integration-openspec 中的四个相同文件 | 手动定向；非默认候选 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 已候选去重，保留定向入口与全部断言 |
| `openspec-convergence-recovery` | 包装 integration-openspec 中的两个相同恢复文件 | 手动定向；非默认候选 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 已候选去重，保留定向入口与全部断言 |
| `package-static` | 源码包元数据、资源映射／摘要、公共入口与受管资产完整性 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `package-workspace` | 源码 CLI 初始化、资源、配置、诊断及用户 AGENTS.md 保护 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留断言；共享初始种子（拟） |
| `package-commands` | 源码默认命令、项目要求、命令增删和 installHint | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留断言；共享初始种子（拟） |
| `package-rules` | 规则登记／必需保护／来源限制／保留文件及诊断 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留断言；共享初始种子（拟） |
| `package-skills` | 完整技能源载入、登记／移除保留源及来源模式 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留断言；共享初始种子（拟） |
| `package-runtime` | 规则引用桥的提示语义、诊断及递归作用域；源码现场 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留断言；共享初始种子（拟） |
| `runtime-skill-projection` | 实际变更技能源在各适配器的完整投射字节、附件、权限和归属 | 改动／定向；非默认候选 | 可复用；全仓输入或 BUILDR_CHANGED_PATHS_JSON 检查子集变化失效 | 单项内种子克隆；非跨项共享 | 保留定向；不默认加入每次候选 |
| `runtime-adapter-parity` | 各支持适配器与实现族的投射、幂等、卸载／恢复、孤儿／链接和用户内容保护 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 单项内种子克隆；非跨项共享 | 保留；无完整重复证据 |
| `repository-onboarding` | 干净仓库显式开发入口、安装与更新，不改写 PATH 默认 npm 安装入口 | 改动／定向；非默认候选 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留定向；不默认加入每次候选 |
| `cli-compatibility` | 完整帮助与代表真实 CLI、零写入、错误退出、JSON、版本／安装身份；含少量初始化冒烟 | 本机 macOS；GitHub 采用或补缺项 | 可复用；后端输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；末尾初始化与其他入口待比对 |
| `service-branch-contract` | 真实临时远端库的服务分支选择、重复选择及冲突拒绝 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `remote-skill-timeout` | 本机受控 HTTP 下远程技能读取的超时与失败；非真实外网可用性 | 本机 macOS；GitHub 采用或补缺项 | 可复用；全仓输入变化会失效 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |


### 产包与真实原包检查（6 项）

| 检查 | 证明什么 | 当前在哪里跑 | 旧结果与重跑条件 | 能共享什么 | 讨论取舍 |
| --- | --- | --- | --- | --- | --- |
| `candidate-tarball` | 生产唯一主包原字节、应用载荷与清单；它是产包步骤，不是功能测试 | macOS 产包；其他作业消费同包 | 构建输入变才需新包；补验沿用原字节 | 依赖、生成物；原包供后续共享 | 保留；无完整重复证据 |
| `application-payload-release` | 载荷确定性／完整性、资源与导出、离线安装及按需启动身份 | GitHub macOS；本机候选也可验 | 非源码复用；正式补验按原包与检查输入另核验 | 同一原包；安装／页面现场独立 | 保留；无完整重复证据 |
| `open-source-candidate` | 公开文件边界、双语说明、元数据、锁文件与原包清单 | GitHub macOS；本机候选也可验 | 非源码复用；正式补验按原包与检查输入另核验 | 同一原包；安装／页面现场独立 | 保留；无完整重复证据 |
| `cli-package-parity` | 开发入口与安装后 CLI 的输出、身份及初始化结果一致 | GitHub macOS；本机候选也可验 | 非源码复用；正式补验按原包与检查输入另核验 | 同一原包；安装／页面现场独立 | 保留；无完整重复证据 |
| `release-tarball-smoke` | 真实原包安装、原生启动器、按需网页、退出、修复／卸载保留已安装包、组件卸载与清理 | 真实 macOS＋Windows | 非源码复用；正式补验按原包与检查输入另核验 | 同一原包；安装／页面现场独立 | 保留独立证明；同组合准备可合并（拟） |
| `artifact-browser-core` | 原包内网页能完成核心工作空间／任务阅读旅程；不是全部页面或安装启动证明 | GitHub macOS；本机候选也可验 | 非源码复用；正式补验按原包与检查输入另核验 | 同一原包；安装／页面现场独立 | 保留；无完整重复证据 |


### 最低／当前 Node 与独立插件（4 项）

| 检查 | 证明什么 | 当前在哪里跑 | 旧结果与重跑条件 | 能共享什么 | 讨论取舍 |
| --- | --- | --- | --- | --- | --- |
| `host-node-contract` | 实际 Node 满足包最低版本及稳定版约定 | 两系统 × 最低／当前 Node | 当前每个实际组合新跑 | 依赖、生成物；无共享可变状态 | 保留；无完整重复证据 |
| `host-node-boundaries` | 实际 Node 下进程、文件系统和 SQLite 的敏感边界 | 两系统 × 最低／当前 Node | 当前每个实际组合新跑 | 公共依赖；本项现场与清理独立 | 保留；无完整重复证据 |
| `host-node-cli-smoke` | 该 Node 安装同一原包，检查身份、帮助、初始化、网页健康与清理 | 两系统 × 最低／当前 Node | 当前每个实际组合新跑 | 同一原包；安装／页面现场独立 | 保留独立证明；同组合准备可合并（拟） |
| `dsh-plugin` | 两种插件变体的构建、逻辑、真实 SDK 装载与准确主包组合 | 插件本机；GitHub macOS | 普通源码复用仅 unit／integration；正式补验可核验采用原包及完整证明 | 固定 SDK／构建；组合数据独立 | 保留；无完整重复证据 |


## 平台、页面和插件的必要明细

### Windows 与最低／当前 Node：保留哪些真实边界

Windows 源码只补 `system-windows-platform` 中的原生命令、PATH／PATHEXT、路径大小写／junction、硬链接锁、taskkill 子树清理，以及 `worktree-create.test.ts` 的一个 Git／CRLF 用例。具体机制和触发路径见[平台清单](../../../services/buildr/test/verification/platform-boundaries.ts)；触发路径不等于完整结果输入。结果使用 `platform-backend` 范围保留真实物化材料及公共声明，不随无关前端／发布技能源变化失效。`release-tarball-smoke` 另证明 macOS 原生应用与 Windows PowerShell 快捷方式的真实原包消费，不重复通用功能全套。

四个宿主证据是 `host-minimum-macos`、`host-minimum-windows`、`host-current-macos`、`host-current-windows`。最低组合测试 `24.15.0`，当前组合取 `24.x`；各跑 `host-node-contract`、`host-node-boundaries`、`host-node-cli-smoke`，共同消费唯一原包。计划中的 `candidate-tarball` 在已注入原包时只是依赖节点，不是四次打包。外层结果名 `host-node-compatibility` 不是第五类测试。最低 macOS 还用固定 npm `11.5.1` 对同包执行发布干运行（Dry Run），不产生公开效果。

这些检查都涉及安装／初始化，但证明对象不同。拟共享同“包＋系统＋Node”组合的下载和不可变准备，保留各自断言、失败与清理；没有断言包含证据前不整项删除。当前宿主组合要求真实新跑，不能写成已有跨组合复用。


### 浏览器：源码页面与原包核心检查分开

源码入口的选择器（Selector）为 `all`、`core`、`shell`、`workbench`、`task`、`task-materials`、`project`、`service`、`change`、`articles`、`layout`、`code`；它们是同一入口的选择范围，不是十二个候选登记步骤。页面改动按相关选择器证明；逻辑测试和网页构建不能代替页面交互。

正式候选 `artifact-browser-core` 仅用 `core`，必须完成 `artifact-unpack`、`artifact-verify`、`browser:core`、`artifact-cleanup`。网页来自唯一原包内的 `web-dist`，不能重建替换；测试后台／夹具仍来自隔离源码宿主，因此它不单独证明安装后的 CLI。当前未证明需要每次候选重走所有页面。


### 插件：各阶段、结果复用和真实双包组合

插件 `dsh-plugin` 有独立工作流作业 `plugin-source-candidate`。仅发插件时绑定准确已公开主包；联合候选绑定新主包原包，发布顺序还核对相应新旧组合。不能用主包日常正常代替插件原包证明。

| 阶段／精确标识 | 证明与顺序 | 当前复用及拟取舍 |
| --- | --- | --- |
| 固定 SDK、正式／开发入口与两种组合构建（无独立检查 ID） | 明确 Node／pnpm、固定 SDK 与补丁／依赖，生成两个不同身份组合 | 共享本次核验 SDK；当前构建在采用源码结果之前，拟按真实缺项减少准备 |
| `dsh-plugin:unit` | 完整插件单元集合 | 已支持有效源码结果采用，不能拿主包 unit 代替 |
| `dsh-plugin:integration` | 插件集成集合，排除独立对端网关文件 | 已支持按源码、依赖及 SDK 摘要采用 |
| `dsh-plugin:peer-gateway` | 单独执行 `source-business-gateway.test.ts`，消费准确主包对端 | 当前每次执行；对端／网关及输入变化需重验 |
| `source-ui` | SDK 和构建入口的源码 UI 组装 | 当前新跑；不是 Chromium，也不证明厂商桌面真机 |
| `released-loader`、`development-loader` | 两种变体的完整清单、自足运行引用、真实 SDK Loader／网关／Slot 组装 | 当前各自新跑；保留两种身份及同场装载，不能只测开发版 |
| npm pack（无独立检查 ID） | 只对已验正式组合打包一次 | 后续验的是同一压缩包，不能再生产“交付版” |
| `actual-package-pair` | 安装插件原包与准确主包，通过真实网关检查组合能力 | 当前新跑，绑定双方包名、版本、摘要与原字节；必须在产包之后 |
| `plugin-full`、`plugin-candidate-bytes` | 汇总完整报告并确认保存的就是被测压缩包 | 是汇总检查，不再运行整个入口；同输入正式补验可核验采用 |

以上六个完整报告标签为 `unit`、`integration`、`source-ui`、`released-loader`、`development-loader`、`actual-package-pair`；`dsh-plugin:peer-gateway` 是单独源码证据。报告仍保留 `runtimeActivated:false`、`desktopValidated:false`，不能称厂商桌面真机已验。

插件单发仍执行共享发布工具检查；联合时可由主包源码证明承担。`main` 后的插件准备下载原候选、调用 `adopt-candidate`，采用原包而不重打。实现见[完整入口](../../../services/dsh-plugin/tools/verify-all.ts)、[真实双包检查](../../../services/dsh-plugin/tools/verify-buildr-plugin-pair.ts)和[原包采用工作流](../../../../../.github/workflows/publish-dsh-plugin.yml)。


### 公开前后的核验：哪些采用候选，哪些必须当场回读

下面是 [release-consumption.ts](../../../services/buildr/test/verification/release/release-consumption.ts) 的十六项发布消费要求，不是另一套测试执行登记。

| 何时成立 | 精确标识 | 处理 |
| --- | --- | --- |
| 采用候选已有证明 | `artifact-browser-core`、`package-contract`、`platform-launcher`、`host-node`、`publisher-cli`、`release-lifecycle` | 映射原包／平台／Node／工具证据；正常公开前不重跑一整轮 |
| 公开前读当前事实与权限 | `artifact-readback`、`publication-authority`、`source-convergence` | 核对原包、来源、受保护身份与审批；本机测试不能替代 |
| 公开及官方回读 | `registry-state`、`tag-state`、`github-release-state`、`npm-publish`、`registry-readback`、`github-release-write` | 未知先回读原请求，保留已成立效果，只恢复剩余动作 |
| 官方消费者 | `registry-install` | 准确官方已公开版本可安装；候选离线原包安装不证明官方仓库可安装 |


## 环境怎样共享

环境准备、测试夹具共享、旧结果复用分别判断。见[准备入口](../../../services/buildr/tools/verification/candidate-environment.ts)和[上下文处置](../../../services/buildr/test/context/dispositions.ts)。

| 当前准备 | 包含什么 | 讨论取舍 |
| --- | --- | --- |
| `base` | 后端开发依赖、生成契约及测试上下文产物 | 可共用本次匹配输入的准备；不复制已污染的可变数据 |
| `frontend` | 再装前端依赖 | 只为前端逻辑等真实需要准备 |
| `source-runtime` | 再构建源码网页 | `test:source` 先看缺项，沿用已有分组准备声明选择最低满足档位；依赖变化后重新观察，必要时升级准备 |
| `artifact` | 主包／网页依赖；隔离产包自行生成材料 | 同构建输入才讨论沿用原包；准备复用不代替产包完整性 |
| `browser-artifact` | 测试运行依赖、生成材料和明确 Chromium | 网页仍读原包；不重建替换候选网页 |
| `consumer`／`host` | 生产依赖，不准备源码网页或前端工具链 | 保留真实干净安装边界；共享包下载与不可变材料不等于沿用本机 node_modules |
| `publisher` | 生产依赖和固定发布 npm | 保留真实发布工具与权限边界，不能由开发 npm 代替 |
| 插件 SDK | 独立固定 SDK、补丁、依赖与构建 | 主包检查不应因此下载 SDK；插件按需要独立准备 |

已有共享：`integration-runtime`、`system-verification-admission`、`system-task-lifecycle`、`system-buildr-web-http` 使用不变任务种子；三个任务读模型／协调／每日演进组可在工作进程（Worker）内共享应用组装，案例数据隔离。部分系统组使用 workspace／project／Git 基础种子，真实创建、迁移和清理仍执行。适配器脚本仅在单项内部共享种子；多数静态／源码资源项没有跨项共享上下文，不能把“可考虑共享”写成“已共享”。

智能体（Agent）临时执行工作空间 CLI／HTTP 开发冒烟应经过 `tools/development/run-isolated-workspace-smoke.ts`；现有自动检查由各自夹具隔离工作目录和两类应用数据，不能污染真实用户状态。初始化、迁移、自举、卸载、恢复和清理本身就是证明内容时，不能用预热后的成品现场替代。

## 本轮调整与剩余边界

明确重复的六个文件是：`openspec-domain.test.ts`、`openspec-deterministic-sync.test.ts`、`openspec-convergence-preflight.test.ts`、`openspec-projected-validator.test.ts`、`openspec-convergence-transaction.test.ts`、`openspec-convergence-recovery.test.ts`，均位于 `test/integration/`。`integration-openspec` 覆盖全部六个；两个包装入口没有新增断言，已退出默认候选，测试断言及手动定向命令保留。


| 实现状态 | 行为与限制 | 依据 |
| --- | --- | --- |
| 已调整：候选去重与输入成员 | 两个包装检查保留手动选择；general 的配方成员与执行过滤共用声明；Windows 使用 `platform-backend`。其他全仓／运行范围仍保守，未知读取不猜测 | `registry.ts`、`verification-input-discovery.ts`、`verification-source-inputs.ts` |
| 已调整：清理失败保全 | 本次共享清理失败阻止相关新证明；原运行已成功且清理干净的复用结果不被撤销，仍须通过当前输入和独立失效核验 | `plan-runner.ts`、`verification-reuse.ts` |
| 已调整：按缺项准备 | 先核验有效结果，按剩余检查准备真实依赖，准备后重新观察；类型检查仍新跑，强制执行同时作用于准备和检查 | `source.ts`、`registry.ts` 的 `NON_REUSABLE_CHECKS` |
| 已调整：逐包只读观察 | `inspect` 分别回读各包 Actions 运行，未知只标未知，不改写指针、不接续或重发；官方包字节和公开事实仍由发布恢复核验 | `skills/buildr-release/scripts/release-orchestration-runner.ts` |
| 尚未合并：安装与初始化准备 | 原包／Node 检查仍分别安装；可继续比较同组合下载和只读种子，保留各自断言、失败与清理 | 原包消费与宿主、`package/run.ts` |
| 尚未完整串联：耗时 | 已有准备／安装／检查排队／执行／重试／汇总记录；原耗时和本次分列，嵌套并发不相加，缺失阶段及智能体处理时间保持未知 | `verification-reuse.ts`、`source.ts`、`candidate-ci.ts` |
| 待验收：工具完整入口 | 发布脚本已迁入技能，检查与汇总留在验证框架；定向回归不等于准备至公开恢复的完整演练。默认公开后自举仍交接唯一执行器，实际结果未接回时保持 pending | `package-release-operation.ts`、`release-orchestration-runner.ts` |

源码检查发现和分组仍由 `test-files.ts`、`system-suites.ts`、`registry.ts` 管理，改动选择由 `ownership.ts`／`planner.ts`，执行与资源由 `plan-runner.ts`／`executor.ts` 等管理；项目地图和正式任务报告应用只管理声明与结果，不执行产品测试。新增检查须接入真实文件发现、归属、定义、依赖和资源；本页仅解释，不新增一套状态或门禁。

当前仍未补齐的完整候选验收包括当前原包安装／启动／核心页面、Windows 最小集合、最低／当前 Node 必要组合、正式完整汇总及适用时插件准确对端组合。历史包和定向平台诊断不能替代；本轮未准备新候选或公开发布，定向检查和图文核对不消除这些缺口。

## OpenSpec 工具依赖风险

现有记录保留 OpenSpec 1.13.0 的开发依赖链 `fast-glob → micromatch → braces` 风险，见[官方公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。生产依赖、项目开发依赖及外部安装须分别审计；当前内置模式未证明存在完整触发路径，也不等于风险已修复。按既有决定暂缓处理，不执行破坏性降级或隐去警报；升级时重新核对实际依赖与能力。
