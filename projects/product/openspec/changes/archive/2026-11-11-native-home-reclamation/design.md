## Context

原生 home 位于 `agent-service/connections/<provider>/model-bindings/<sha256>/`，绑定身份由账号、模型、对话和配置派生。每个绑定内的原生会话是工具详情读取、结果核对与交接来源的证据，但 Buildr 同时保存可见消息、执行状态与工具引用。现状没有任何入口回收已无引用的会话对象；按文件年龄直接删除会破坏未结束或结果未知的恢复证据，因此本变更以“引用证明”而不是“年龄”作为删除前提。

真实数据（开发 profile，只读测量）：104 个对话引用 103 个配置路径；原生工具内容 32,177 条，其中 Codex 18,741、DSH 10,882；Codex 已积累约 197 个 rollout 文件（约 937 MB），DSH 约 131 个会话目录（约 105 MB）；全部已接受尝试都具有上下文证据。

## Goals / Non-Goals

**Goals**

- 提供可审计、默认 dry-run 的显式入口，回收已完整证明无引用的单个原生会话对象。
- 任何不可读、未解析或缺少上下文的证据都只导致受影响范围保留，不扩大删除。
- 复用既有存储回收链路（稳定窗口、系统占用、身份复核、锁、分批与预算）。

**Non-Goals**

- 不删除整个绑定 home、账号、凭据、`config.toml`、状态库、插件、附件或 Qoder 账号目录。
- 不让自动维护 worker 选择原生会话；周期维护行为不变。
- 不做插件重复副本去重、Qoder 保护日志清理、数据库 VACUUM（另行评估）。
- 不迁移、重写或压缩原生会话内容。

## Decisions

### 1. 候选单位是单个原生会话对象

- Codex：`codex-home/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl` 文件，`contextId` 为文件名末尾 UUID。
- DSH：`dsh-home/sessions/<workspace-key>/session-<uuid>/` 目录（含 `session.v4.jsonl[.zstd]` 与 `session.lock`），`contextId` 为目录名中的 UUID。

只枚举 `connections/{codex,dsh}/model-bindings/<64hex>/` 下列出的规范层级；目录或文件是符号链接、所有权不属于当前用户、结构不匹配时该对象直接保留。绑定 home 整体、账号级 `connections/<provider>/` 根与 Qoder 目录永不枚举。

### 2. 引用清单必须覆盖全部持久证据

`nativeSessionReferences(root, repository)` 汇总：

| 来源 | 提取 | 失败处理 |
|---|---|---|
| 对话头（全部对话） | 每个参与者（含 `historical`）的 `contextRef.id`；每次尝试的 `executionRef.data.resourceContext` 与 `participation.context.id` | 任一对话头不可解析 → `complete=false` |
| 原生工具内容（全部对话、全部修订） | v3 的 `provider` + `contextId` + `session.config`；旧 v1/v2 的 `text/input[].source.path` | 任一行无法解码 → `complete=false`（受影响提供者保留） |
| 交接来源索引 | v2 索引 `index-<sha256>.json` 中 `records[].native` 的同一组字段；旧 v1 索引按其 round 文件中的结构化原生记录 | 索引或 round 缺失/损坏/不安全 → `complete=false` |

每个引用解析到 `(provider, contextId)` 并尽力核对绑定：v3/工具引用通过 `session.config` 或旧编码 `source.path` 得到绑定；对话头通过 `configRoot(root, record, participant)` 重算绑定。缺少准确上下文身份、来源不可解码或绑定证据互相冲突（提供者不一致、多个绑定）时把 provider 记入 `unresolved`，该 provider 的全部会话保留；仅记录账号根（如 `connections/codex`）但带准确 `contextId` 的引用只保留该会话，不扩大为整个提供者。尝试存在引用但没有任何上下文证据时把 provider 记入 `unknownContext`，同样全部保留。

索引导入沿用 `handoff-sources.ts` 已有安全约束（`O_NOFOLLOW`、`nlink===1`、大小上限、版本与内容哈希），不新增第二套解析。旧 v1 索引的哈希来自写入前完整输入、无法从文件复现，因此只接受已知结构，并逐一校验其引用的 `round-<sha256>.json`（内容哈希、`nlink`、大小）；任一 round 缺失或损坏仍视为不完整。

### 3. 保留规则与理由顺序

单个候选项的判定顺序（先命中先返回）：

1. `storage_path_unsafe`：路径逃逸、链接或所有权异常。
2. `storage_usage_unknown`：系统占用观察不完整。
3. `storage_in_use`：任一进程打开会话文件、会话目录或以其为工作目录（`observeStorageUse` 已包含 cwd 条目）。
4. `native_session_reference_observation_failed`：引用清单不完整。
5. `native_session_binding_unresolved`：该 provider 的绑定无法解析。
6. `native_session_context_unknown`：该 provider 存在无上下文的引用。
7. `native_session_referenced`：`provider:contextId` 出现在任一来源中。
8. `storage_recent`：最后修改时间在 24 小时稳定窗口内。
9. `unused_native_session`：以上均不成立，`eligible=true`。

保留理由与候选大小、身份一并写入 dry-run 收据；排序让“不安全/占用/引用”优先于“近期”，便于审计。

### 4. 显式门禁与执行路径

- `inspectAgentStorage({nativeSessions?: boolean})` 默认 `false`；周期 worker `agent-storage-maintenance` 不传该选项，计划中永不出现 `native-session`。
- `collectAgentStorage(plan, maximum, {confirmNativeSessions?: boolean})` 默认 `false`。计划含原生会话但未确认时，执行结果逐项返回 `native_session_confirmation_required` 并保留。
- 确认执行时：在原维护锁内重新生成计划（只含原生会话）、重新计算引用清单、按最多 256 项分组，使用共享系统观察的批量删除；删除前后复核身份、占用与引用，失败项恢复原名并报告。
- 单次预算与 `maximumItems` 沿用现有上限；工具脚本默认只做 dry-run 并输出 JSON 收据，`--confirm` 才调用执行。

### 5. 批量删除复用既有条件链路

扩展 `removeSmallResourceBatch` 支持 `native-session`：允许文件或目录、超过 256 KB、节点上限 64、每项独立身份与引用复核、共享一次删除前/后系统观察、失败恢复。Codex 单文件与 DSH 单目录都远低于节点上限。`removeStorageCandidate` 对 `native-session` 使用 `safeStorageResource` 判定（当前 `safeStoragePath` 只接受目录）。

## Risks / Trade-offs

- **引用漏检导致工具详情不可读**：以“任一来源不可读即保留”兜底；测试覆盖旧 v1/v2、交接索引、未解析绑定与无上下文引用。
- **批量删除期间新会话产生**：删除前后两次系统观察；新文件不在原计划身份内，不会被删除。
- **DSH 目录内锁文件**：`session.lock` 在活动会话中由进程持有，系统占用观察会命中；不单独解释锁文件语义。
- **保守保留仍可能留下大量对象**：可接受；dry-run 会显示保留理由分布，后续版本再评估更细的绑定级证明。
- **绑定哈希不可逆**：收据只报告哈希前缀与相对路径，不读取会话正文。

## Migration Plan

- 无存储格式迁移；只新增只读查询与显式操作入口。回滚只需停止使用工具脚本。
- 首次真实执行前以 dry-run 收据核对候选与保留原因，用户确认后再执行。

## Open Questions

- 无。插件去重、Qoder 保护日志与数据库整理不在本变更范围。
