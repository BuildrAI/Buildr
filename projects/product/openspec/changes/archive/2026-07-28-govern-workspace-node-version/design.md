## Context

Buildr 的启动与正式执行目前有三套不一致的 Node 解析方式：开发 bridge 从 `BUILDR_NODE`/`PATH` 选择任意 Node 20+，普通 `npm`/verification command 继承调用环境的 `PATH`，Task Finish 则只在部分子进程前追加当前 `process.execPath`。Workspace metadata 不接受 runtime 字段，因而没有一个受版本控制、可被 `init`、`sync`、`doctor`、task environment、Verification 和 Finish 共同消费的 Node authority。

本设计把精确 Node version 纳入 Workspace Domain，同时把本机 runtime 视为可重建投影。Agent runtime adapter 只消费解析结果，不保存、选择或改写版本。

## Goals / Non-Goals

**Goals:**

- 让同一 Workspace 的 Buildr CLI、npm、测试、Verification、Candidate 与 Finish 使用同一个精确 Node version。
- 让声明可版本控制、本机 runtime 可删除并由 `sync` 按原版本恢复。
- 让 `doctor` 在不写入的前提下准确报告声明、runtime 和进程解析漂移。
- 让 Node identity 成为 task environment、candidate evidence 和 Finish 复用条件的一部分。
- 保持 Node 升级为显式 Workspace metadata 变更，避免 `sync` 隐式改变 toolchain。

**Non-Goals:**

- 不改变 `package.json#engines.node` 表达的 Buildr 产品兼容范围。
- 不让 Agent adapter、Codex/Claude runtime 或 Task Finish 私有状态决定 Node version。
- 不实现通用语言版本管理器，也不接管 Project 自己声明的其他 runtime。
- 不从网络自动选择“最新”Node；所有恢复都使用 Workspace 已声明的精确版本。

## Decisions

1. **在 `.buildr/workspace.yml` 保存精确版本。** canonical shape 为 `runtime.node.version: <major.minor.patch>`。Workspace manifest parser 负责格式和 Buildr compatibility 校验，Workspace identity material 包含该声明。相比 `.nvmrc`、`package.json#engines` 或 Agent runtime metadata，这能保持 Workspace ownership 与单一 schema authority。

2. **`init` 采用启动当前 Buildr 的精确 Node version。** `init` 已经必须在受支持 Node 上运行，因此使用 `process.versions.node` 可以在不查询“最新版本”的情况下作出一次性、可解释决定。它先写入声明，再准备同版本 runtime；显式升级通过受版本控制的 Workspace metadata 变更完成。备选方案是 `init` 每次查询最新 LTS，但这会使相同输入随时间漂移并把网络结果变成版本 authority。

3. **本机 runtime 是 Buildr user state 下的共享可重建缓存。** 路径按 `<version>/<platform>-<arch>` 隔离，内容来自 Node 官方发行包并使用同版本 `SHASUMS256.txt` 校验，临时目录验证后原子替换。声明不保存机器绝对路径。相比把 runtime 提交进仓库，该方案避免大型二进制污染；相比只保存外部 Node 路径，它能在原安装被删除后恢复。

4. **启动器区分正常执行与恢复 bootstrap。** 在已初始化 Workspace 中，launcher 必须先解析声明并使用受管 Node；普通 `PATH` 不参与再次选择。只有 `init`，以及声明/runtime 无法使用时的只读 `doctor` 和修复型 `sync`，可以借用任一满足 `engines.node` 的 bootstrap Node 启动产品逻辑。bootstrap Node 不是 Workspace identity，不能执行普通业务命令或改写版本声明。

5. **统一构造 Workspace Node execution environment。** application service 返回 Node identity、绝对 `node`/`npm` 路径和以 runtime `bin` 为首的 PATH。verification executor、Task Finish、task environment CLI invocation 和安装流程消费该对象，不再各自拼装 PATH。命令声明中的 `node`、`npm`、`npx` 使用该 runtime；其他工具仍按 Project policy 解析。

6. **Node identity 是可比较的领域值。** identity material 包含 Workspace UUID、声明版本、platform、arch 和 schema，不包含机器绝对路径。runtime probe 另外记录 executable、实际版本和可用状态。这样不同 checkout 能比较相同 Workspace toolchain，同时能诊断单机 runtime 损坏。

7. **Verification 与 Finish fail closed。** `buildr.verification-run/v1` 在 evidence 与 evidence digest 中包含 Node identity。Finish freeze 固定 Node identity；已有 evidence 缺失或不匹配时不可复用，声明或 runtime 在 preflight/verify/deliver/resume 之间漂移时停止并返回稳定失效原因。

8. **已有 Workspace 采用显式兼容迁移。** legacy metadata 可由 `sync` 在保持其他 identity 的前提下增加当前受支持 Node 精确版本并准备 runtime，但 canonical v1 缺少声明时 doctor 不再报告 runtime-ready。migration 是可观察写入，不由 Agent runtime 或普通 doctor 自动执行。

## Risks / Trade-offs

- [首次 `init`/恢复需要下载 Node 发行包] → 校验官方 SHA-256，使用有界超时、临时目录和原子替换；网络失败保留声明并返回可重试 `sync` 诊断。
- [Node 官方包的 platform/arch 组合有限] → 显式维护支持映射，不支持组合在写入或下载前失败，不回退到随机 PATH runtime。
- [CLI 在 runtime 被删除时仍需要 Node 执行 `sync`] → 仅允许 recovery command 借用兼容 bootstrap Node，并在结果/evidence 中披露 bootstrap 与 Workspace identity 的差异。
- [已有 Workspace 缺少声明] → doctor fail closed；`sync` 的一次性 migration 使用当前 CLI Node 并明确报告 metadata 变化，之后不得自动换版。
- [下载与 Candidate 测试耗时增加] → unit/integration 使用注入的本地发行 fixture；Candidate 只做一次受控真实或等价 package lifecycle 验证。

## Migration Plan

1. 扩展 Workspace schema/parser/render 与 Node runtime domain service，同时保留 legacy manifest reader。
2. 让 `init` 写声明并准备 runtime，让 `sync` 完成 legacy migration/缺失恢复，让 `doctor` 只读报告。
3. 将 development/installed launcher、task environment、verification 和 Finish 切换到统一 Node identity。
4. 为已有自举 Workspace 显式加入当前采用版本并运行新 `sync`；验证普通 PATH 前置 Node 18 不影响执行。
5. 回滚时保留 Workspace 声明和本机 cache；旧 Buildr 会把新字段视为未知，因此版本回滚必须同时回滚 metadata commit，不能静默丢弃声明。

## Open Questions

无。Node 版本升级命令不是本 Change 的必要条件；当前可通过显式编辑/评审 Workspace metadata 完成，后续可再增加专用 CLI。
