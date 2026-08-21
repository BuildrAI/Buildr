## Why

正式 Task 目前能够证明基础 Environment `ready`，却不能保证稍后选中的 Verification capability 已具备完整工具链；权威 Node、路径基准和跨 Service 验证依赖仍可能由 Agent 手工传递或在昂贵验证启动后才暴露。该缺口已在 Buildr 自举任务中重复造成 `BUILDR_NODE`、相对路径、Buildr Web 依赖和本地 TypeScript 的迟发失败，也会以不同技术栈形式出现在用户 Workspace。

## What Changes

- 将 Task scope 的基础准备与所选 Verification capability 的专用准备闭包分层：Task scope 继续拥有交付范围，capability 只能声明可审计的辅助准备依赖，不借此扩大 Task 内容所有权。
- 让 Environment Receipt 和 compact execution route 暴露可直接消费的权威 runtime invocation；controller、Preparation 与 Verification runner 自动沿用该事实，不再要求 Agent 手工转抄 `BUILDR_NODE`、PATH 或机器绝对路径。
- 将 Environment Plan/Receipt 中的 `cwd`、inputs 与 outputs 规范化为带 Workspace、Project、Service 或 Step 基准的路径引用；将 executable 单独建模为 closed 可执行程序权威引用（Executable Authority Reference），由受管 runtime、Workspace Foundation、Service wrapper 或显式机器 observation 解析，并在任何执行前完成 identity、越界与来源校验。
- 扩展 Project Verification capability 的 environment 边界，使其可以引用 Project `preparation.yml` 中已声明的 Recipe；Verification admission 根据实际选中的 capabilities 计算唯一准备闭包，由 Task Environment 幂等准备并在昂贵命令、浏览器或外部资源启动前形成低成本 preflight 结论。
- 缺少能力覆盖、声明无效、preparation 漂移、授权缺失或外部系统不可用时，在副作用前分别返回可归因的 coverage、declaration、preparation、authorization 或 external-system diagnostic；只有声明 Recipe 能恢复的缺口才交给 Task Environment，不扫描技术栈、不猜安装命令、不回退全局工具。
- 新门禁只阻止 matching Formal Verification execution、Result 与完成声明；Buildr 自身暂不可用时，Agent 仍可继续无关工作、只读调查与有界非正式检查，但 MUST 明确其不是 Formal Verification，并在 Buildr 恢复后通过 Task Environment 重建正式事实。
- 固化发行边界：npm installation 自身的产品启动、package entry、Launcher 和发行版 `buildr web` 只消费兼容 Host Node 与随包 `web-dist`，不得依赖 Buildr Product 源码依赖、源码 TypeScript 或手工 `BUILDR_NODE`；`doctor`、`sync` 等命令仍按各自能力边界读取目标用户 Workspace 的权威资产。
- 保持现有 Project/Service 声明值负责“需要什么”、机器 observation 负责“本机有什么”、Receipt 负责“本次实际用了什么”；Buildr 核心只固化解析、校验、闭包与失败语义。
- 不包含用户可见前端 UI 变化；不删除现有 Preparation/Verification capability，也不降低正式验证范围。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `project-test-capabilities`: Verification capability 可以显式引用已声明的准备 Recipe，并保持辅助准备不等同于 Task scope 或测试 DAG。
- `task-environment-preparation-plans`: Plan 形成基础准备与 capability 辅助准备的闭合选择，分别规范化 Workspace 内路径引用与 executable authority。
- `task-environments`: Receipt 提供权威 runtime invocation、准备闭包和路径解析事实，Task Environment 仍是唯一准备与恢复 writer。
- `task-verification`: Verification admission 在执行前只读校验 matching Environment 准备闭包，workflow 仅把可恢复的 supplemental request 交给 Task Environment；runner 绑定同一 selected capability、closure、Plan/Receipt 与 runtime identities 后才执行。
- `local-app-browser-verification`: Buildr Browser capability 在构建前证明 Buildr Web 本地依赖与本地 TypeScript current，不借用全局工具。
- `npm-cli-package`: 发行版安装和 `buildr web` 与 development checkout 的精确 Node、源码依赖及源码 TypeScript 保持隔离。

## Impact

- 受影响的产品模块包括 Task Environment Plan/Receipt/Application、Project Verification declaration parser、Verification admission/runner、Task Entry compact route、Buildr 自举 runtime bridge、Browser verification 以及相关 Skills、capability contracts 和测试。
- `preparation.yml` 与 `verification.yml` 仍是 Project-owned 长期声明；机器路径、运行状态、凭证和完整输出不进入声明或 Git。
- 需要为既有声明和 current Receipt 明确兼容读取与显式升级策略，避免把新准备闭包静默回填到旧 Task。
- npm package、Launcher、`web-dist` 托管及用户 Workspace runtime 不引入 Product 源码构建依赖，但不限制命令读取目标 Workspace 自身的权威资产。
