## Context

Project 与 Service v2 Domain 当前用 `source.type` 同时表达 Git 边界，并用固定 Workspace-relative `source.path` 表达物化位置。Project repository 固定读取 root `projects/manifest.yml`，Service repository 又固定从 `projects/<project>/services/manifest.yml` 读取；Doctor scope、Git observation 和下游应用大量重复 `path.resolve(workspace, source.path)`。因此外部仓库无法成为正式 Project/Service source，且诊断缺少可供 consumer 选择的 action/domain 维度。

本次变化横跨 Workspace Domain、文件投影、CLI、Doctor 与下游 source resolver。必须保留 Core 中 identity/ownership/path/transaction 的硬边界，并避免把 Attached Root 注册解释为 Buildr 已取得写入或删除权。

术语按 Project current knowledge 核对：受管根（Managed Root）是 Workspace 内由 registry writer 创建或维护的默认根；附接根（Attached Root）是用户明确登记、保持原 repository ownership 的 Workspace 外部根。两者描述 topology 与 ownership，不替代 `source.type` 的 Git/Workspace source 语义。

## Goals / Non-Goals

**Goals:**

- 让现有 v2 managed entries 零迁移继续读取，并允许新 entry 显式声明 Attached Root。
- 通过一个 source resolver 统一定位 Project、Service、registry 与 Git observation，消除按目录形状猜测。
- 提供安全的 `--attach <absolute-path>` 接入路径；接入只验证和登记，不 clone、copy、move、checkout、relink 或删除源内容。
- 让 Doctor finding 具备 domain、affected actions、ownership unit，并生成分域 health；保留总体 `ok`/`health` 兼容摘要，但声明其非通用许可。
- 让 sync/Capability/Component consumer 按当前 action 选择 findings；共享 writer/transaction 与 required Core 冲突仍阻止对应原子批次。

**Non-Goals:**

- 自动迁移已有 managed repo 到外部目录，或自动 adopt/transfer Attached Root ownership。
- 支持非 Git Attached Root；首个版本只接受可证明 remote identity 的独立 Git repository。
- 把绝对附接路径当作可跨机器直接使用的事实；另一台机器不可访问时保留 registry identity并给出局部 re-attach 诊断。
- 建立全局 health state、后台修复队列、第二 registry 或新的 SQLite authority。
- 改写 Task Finish、Environment、Verification 的证据模型；这些 consumer 只通过统一 resolver 获得明确 source，仍保留各自 authorization。

## Decisions

### 1. 兼容扩展 source，而不立即升级整个 registry schema

`source.type` 继续是 `workspace|git`。新增可选 `source.root`：缺失或 `managed` 表示既有 canonical managed path；`attached` 表示 `source.path` 是规范化绝对路径，且首版必须同时为 `type: git`。读取旧 v2 entry 时投影 `root: managed`；renderer 对 managed entry 省略该字段，避免无意义全量 churn，对 attached entry 写入 `root: attached`。

选择这一方案而不是 v3，是因为现有 v2 identity、关系和 Git 声明仍然成立，变化只扩展 location topology。选择绝对 path 而不是 symlink 或复制，是为了保持真实 filesystem/Git topology；其机器局部性由 Doctor 明确诊断，不伪装为 portable location。

### 2. 唯一 source resolver 分离声明、定位与 ownership

Workspace owner 提供纯函数与 Application capability：规范化/验证 source、解析实际 root、判断 managed/attached、生成稳定 source identity（entity UUID + topology + Git declaration digest）并返回 ownership policy。所有 Project/Service read、Doctor、Change/OpenSpec、Publication、Verification、Task Environment/Finish 等逐步改用该 capability，不再自行拼接固定目录。

Managed Root 必须处于 canonical Workspace 并匹配默认 path。Attached Root 必须是绝对路径、不得等于/包含 canonical Workspace、不得与另一 source realpath 重复，并必须通过 Git top-level、remote URL、remote name 与 integration branch identity 预检。无法 realpath 或 identity 冲突时只读 detail/Doctor 返回局部 unavailable/conflict；依赖该 source 的 mutation fail closed。

### 3. attach 是登记动作，不是内容 mutation

`project create --attach <path>` 与 `service create ... --attach <path>` 只在用户明确选择路径后启用。命令在 registry 写入前读取实际 Git identity并与显式/已登记 declaration 比较；成功只写对应 registry（以及 Attached Project 缺失时在其自身已有 `services/manifest.yml` 上不做隐式初始化）。它不进入 `withWorkspaceMutation` 的外部 source snapshot，也不写 Attached Root。

Project baseline、Service manifest 或声明缺失作为该 domain 的诊断；任何“补齐 Attached Root 文件”都必须是后续明确 action。删除/取消登记默认只移除 registry relation并保留外部内容，源删除需要独立明确授权且本 Change 不提供。

### 4. Service registry location 跟随 Project source root

Project registry 仍是 Workspace root 的唯一 Project authority。Service registry 固定为已解析 Project root 下的 `services/manifest.yml`，无论 Project 是 managed 还是 attached；Service source path 独立解析，允许 managed Service 位于 Project 默认目录，或 attached Git Service 位于外部绝对路径。这样保持 Project 对 Service collection 的 ownership，不在 Workspace root 复制第二份 Service registry。

### 5. finding 驱动分域 health，而非全局许可

每条 Doctor finding 增加：

- `domain`: `workspace|project|service|git|runtime|component|command|capability|transaction|installation`；
- `scope`: Workspace/Project/Service selector；
- `affectedActions`: 受影响的 inspect/reconcile/sync/create/update/delete/render/execute/finish 等动作；
- `ownershipUnit`: 对应 registry、asset、runtime projection、repository 或 shared transaction identity。

Doctor 从 findings 生成 `domainHealth[]`，每项包含 status、actionableCount 与 blockedActions。`health.ready` 保留兼容摘要，仅表示本次 Doctor profile 没有 actionable finding；新增 `health.generalWorkPermitted: null` 明确 Doctor 不判断通用工作许可。consumer 必须按 domain/action/ownership unit 过滤；缺少 action metadata 的旧 finding保守归入其既有 domain，但不自动扩大到所有动作。

### 6. 局部收敛以 ownership unit 为事务边界

Workspace sync 先分别规划 builtin、Component、Rule/Skill/Command source、runtime projection 等 unit。optional/foreign-owner conflict 的 unit保持原样并报告，其余独立 unit可提交；只有 required Core、同一 manifest writer、同一 transaction journal 或无法分离的完整性集合才阻止对应批次。Capability route blocked 只阻止声明依赖该 provider 的 consumer；Component conflict 只阻止该 Component atomic unit。

## Risks / Trade-offs

- [Risk] versioned registry 保存绝对 Attached Root path，在另一台机器上不可用。→ 保留稳定 entity/Git identity，Doctor 只把该 source 标为 unavailable，并提供显式 re-attach；不自动改 path。
- [Risk] 大量旧 consumer 直接拼接 `source.path`，遗漏会错误拒绝 Attached Root。→ 建立 resolver 后用静态检索和 focused tests 覆盖全部生产调用点；仍需 Workspace 内 path 的 consumer必须显式声明 managed-only。
- [Risk] Attached Project 的 Service manifest 写入可能越过 Workspace mutation snapshot。→ attach 本身不创建/修复外部 baseline；后续 external write 需要独立 ownership/authorization并使用针对该 root 的 writer guard。
- [Risk] domain/action 标签错误会过度放行 mutation。→ 安全相关旧 finding 默认保留当前阻断；只有明确标注且 consumer 明确选择 action 时才局部化，required Core/transaction/identity/path/delete 永不降级。
- [Trade-off] 首版不支持非 Git Attached Root，覆盖面小于任意本地目录。→ 先用可验证 remote identity闭合安全模型，后续通过独立 Change 评估 filesystem-only identity。

## Migration Plan

1. 增加 source root parser/resolver 与兼容 tests；旧 v2 bytes 读取、render 保持稳定。
2. 增加 Project/Service attach CLI 与只读 detail/Doctor 支持，先覆盖真实外部 Git fixture。
3. 将生产 source consumers迁移到 resolver，保留 managed-only consumer 的显式 guard。
4. 扩展 Doctor finding/domain health，并审计现有 `health.ready` consumer；只保留 init、完整 sync 与正式自举等明确整体验收场景。
5. 按 ownership unit 调整 sync/Capability/Component conflict handling，增加无关 unit 继续的反例测试。
6. 若部署后出现未知 source shape，parser fail closed且不重写 registry；回滚代码不会理解 attached entry，因此回滚前必须停止对含 attached entry 的 mutation，不删除或转换外部内容。

## Open Questions

无。非 Git Attached Root、portable local locator 与显式 external delete 都留给后续独立 Change。
