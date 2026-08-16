## Context

Workspace Node 当前同时承担四类职责：Workspace metadata 版本 authority、本机 runtime 下载恢复、所有 Verification/Task Environment/Finish 的执行身份，以及 Buildr 自举 checkout 的开发 Node。前三类把 Node 错误投射给所有用户 Workspace；第四类却是 Buildr Product 自身真实需要。

现有 Buildr checkout 的 `.buildr/workspace.yml` 固定 `24.15.0`，但 development launcher 只检查 `>=24.15.0 <25` 并从 PATH 选择首个兼容版本，本机实际可能使用 `24.19.0`。删除 Workspace Node 后必须同时关闭这一漂移路径，否则自举验证会失去精确 Node authority。

## Goals / Non-Goals

**Goals:**

- 让没有 Node 声明或受管 runtime 的普通 Workspace 在 Doctor、sync 与非 Node Task 中保持健康。
- 删除 Workspace Node 的 domain、runtime、execution identity 与公开投影，不建立替代的通用 runtime 模型。
- 让 Buildr development checkout 用一个 Product-owned 精确 Node 版本，并让 CLI、npm preparation、Verification、CI 与 self-bootstrap 前置检查使用同一版本。
- 最低限度读取旧 metadata/evidence，canonical sync 后移除旧字段且不删除本机 runtime 文件。

**Non-Goals:**

- 不为 Node、Java、Python、Go 或其他技术栈增加 Buildr adapter/provider。
- 不自动安装用户 Project/Service 所需工具，也不扩展 Verification declaration schema。
- 不保证旧 active Finish run 跨升级原样 resume；旧 Node 字段只读兼容并从新 identity 中忽略。
- 不修改集鲜或其他用户 Workspace 的业务声明。

## Decisions

### 1. Workspace Node 完整退役，不降级为 optional module

Workspace domain 不再拥有 `runtime`。v1 reader 接受旧 `runtime.node`，但 domain object、public workspace、Doctor 与 execution consumers忽略它；canonical renderer 省略该字段，sync 只重写 metadata 而不准备或删除 runtime。

选择完整退役而不是 optional module，是为了避免 Doctor、sync、JSON 与 receipts 继续保留一条没有通用产品意义的第二生命周期。

### 2. 普通命令只消费显式声明和当前执行环境

Verification 直接执行 capability `argv`，不再替换 `node/npm/npx` 或注入 Workspace Node PATH。Task Environment 只在 Preparation Step 显式使用 `workspace-foundation` 时从当前进程 PATH 解析该命令、记录真实 executable identity；没有该 Step 的 scope 不形成 runtime probe。

这保持现有 schema 与 Project ownership，不新增工具链解析模型。具体命令缺失只阻塞对应 capability/Step，不影响 Workspace Doctor 或无关 Task。

### 3. 从所有正式任务 identity 中删除 Workspace Node

Verification execution/result record、Task Environment read model、Finish run/resolved context、recovery 与公开 JSON 删除 Workspace Node 字段和漂移门禁。旧持久记录中的附加字段允许读取并忽略；新写入不再生成这些字段。

这样 evidence 只绑定实际 Task 内容、声明、Environment、Candidate 与执行结果，不把一个无关全局 runtime 作为所有任务适用性输入。

### 4. Buildr checkout 使用 Product-owned 精确开发 Node

在 Product checkout 保存唯一精确版本 `24.15.0`。npm package 的 `engines.node` 继续表达正式 Host Node 兼容范围 `>=24.15.0 <25`；两者职责不同。

development CLI 与 Product npm wrapper只接受精确版本：显式 retained Node优先，其次只从受控 PATH 候选中选择完全匹配版本；找到其他兼容版本也不得采用。Product preparation 与 verification declarations 调用该 wrapper，CI 继续安装同一精确版本。版本升级必须在同一 source change 中更新精确声明、入口与 CI parity 测试。

选择 checkout 精确 pin 而不是继续使用 Workspace metadata，是因为该要求只属于 Buildr Product；选择 fail closed 而不是自动下载，是为了不重新引入 Workspace runtime lifecycle。

### 5. self-bootstrap 继续使用唯一 runner

正式自举 handoff 仍由 `buildr-self-bootstrap-sync` 唯一 runner 编排。runner 从 matching Environment/checkout development Node authority取得精确 executable，在 retained sync、development installation、entry identity、最终 Doctor 与 Finish resume 前验证版本一致；Agent 不拆分补跑。

该变化只替换 Node authority，不改变 self-bootstrap 的唯一 owner、顺序或授权边界。

## Risks / Trade-offs

- [本机只有兼容但非精确 Node 时 Buildr checkout 不能运行] → 提供明确 expected/actual 与 `BUILDR_NODE` 恢复提示；正式 npm Buildr 仍按 engines range 工作。
- [旧 active execution/Finish identity 包含 Workspace Node] → reader 忽略旧字段；需要继续执行时重新准备/验证，不静默重绑旧 run。
- [`workspace-foundation` 解析 ambient PATH 可能漂移] → 每个 Preparation Step 记录绝对 executable identity；Buildr Product 自身通过精确 wrapper消除漂移，通用 Workspace 不承诺工具安装。
- [删除字段影响大量 JSON/tests] → 同步修改 schema registry、fixtures、recovery 与 contract tests，并增加无 Node Workspace、非 Node Verification、hostile PATH、自举 exact Node 回归。
- [旧 runtime 留在磁盘] → migration 不删除；未来只有显式、独立授权的回收动作才可处理，本 Change 不新增 GC。

## Migration Plan

1. 先加入 Buildr checkout 精确开发 Node pin与 wrappers，使自举执行不再依赖 Workspace metadata。
2. 删除 Verification、Task Environment、Finish 和 public JSON 的 Workspace Node consumer。
3. 修改 Workspace parser/renderer、init/sync/Doctor，并删除 runtime implementation与package assets。
4. 让 canonical sync 接受旧字段并输出无 `runtime.node` 的 metadata；不触碰本机 runtime目录。
5. 运行无 Node Workspace、非 Node execution、Product exact Node、hostile PATH、package/release 与 self-bootstrap相关验证。

回滚只恢复代码与 canonical specs；已由新 sync 移除的 Workspace字段不自动回填，旧 Buildr 版本因此不应重新用于已迁移 Workspace。

## Open Questions

无。精确开发版本沿用现有自举与 CI authority 的 `24.15.0`。
