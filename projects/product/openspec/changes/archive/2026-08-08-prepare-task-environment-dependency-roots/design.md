## Context

`candidateCli()` 能确定自举 Task checkout 中 Buildr CLI 的 package root，但当前 `ensureCandidateDependencies()` 只处理这一个 root。`taskScopes()` 已能从 Task Record 和 canonical Project/Service registries形成 workspace/project/service scopes，然而 `prepareFoundations()` 把候选 CLI 的单一依赖 probe 复制到全部 scope。Product 的 `buildr` Service 又通过 `npm --prefix ../buildr-web run build` 消费 sibling `buildr-web` 源码构建，因此新的 worktree 可以在 `buildr/node_modules` 已安装、`buildr-web/node_modules` 缺失时仍得到假 `ready`。

Environment current 仍由 Workspace SQLite `task_environment_current.receipt_json` 唯一持有。现有 Receipt v2 是 closed schema，scope 只有一个四字段 dependencies probe；它不足以表达多 dependency-root 的声明来源、独立 identity、准备结果与失败位置。

## Goals / Non-Goals

**Goals:**

- 用一个明确的 Project 声明决定 Task scope 对应的 Service dependency roots 与跨 Service source-build 闭包。
- 每个 npm root 使用自己的 manifest、lockfile、worktree-local `node_modules` 和 Workspace Foundation 受管 npm。
- 独立记录、观察、准备和恢复每个 required root；任何 required root blocked 时 Environment blocked。
- CLI `inspect` 能只读发现缺失或 identity 漂移；Local App GET 只读保存的 current，不在请求路径执行文件系统或 npm probe。
- 兼容读取现有 v2 current，并只在显式 `prepare` 时升级 active Receipt；不新增 Environment store。

**Non-Goals:**

- 不建立多 package-manager adapter framework；首版只支持声明式 npm/package-lock roots。
- 不扫描仓库中的 package manifests/lockfiles，不自动纳入未声明 Service。
- 不把 source-build 依赖写入 Buildr npm package runtime dependencies。
- 不共享、复制或软链接不同 checkout 的 `node_modules`。
- 不改变 Task Record、Git provider、Task Verification 或 cleanup authority。

## Decisions

### 1. Project 使用单一 Task Environment dependency declaration

在 Project 根新增可选 `task-environment.yml`，schema 为 `buildr.project-task-environment/v1`。声明按 Service code 保存：

- `dependencyRoots[]`：稳定 id、`manager: npm`、Service-relative root、manifest、lockfile、required；
- `requires[]`：同 Project sibling Service code 与用途说明。

Task scope 中的 Service 是闭包入口；`requires` 按显式图传递展开。候选 CLI 的 owning Service root作为 bootstrap root单独加入，但 bootstrap 不自动展开其 source-build `requires`，避免任意 Product Task 因运行候选 CLI而无条件安装全部前端工具链。

选择独立 Project 声明而不扩展 canonical Service entity，是因为 Service registry 只负责实体身份和 source；包管理和 source-build 关系属于 Task Environment 准备契约。选择一个 Project 图而不是每个 Service 分散文件，是为了让跨 Service 边可原子校验，避免双向或缺失声明。package.json 和 shell scripts只作为被声明 root 的内容，不作为 routing authority。

声明缺失或某个 scoped Service 没有条目时，该 Service 为依赖 `not-applicable`；但已声明的 required root 字段无效、越界、manager不受支持或依赖图引用未知 Service时必须 blocked。首版 Product 声明完整覆盖 `buildr` 与 `buildr-web`。

### 2. Receipt v3 保存 root facts，scope 只保存聚合摘要

Receipt 升级为 `buildr.task-environment-receipt/v3`，新增顶层 `dependencyRoots[]`。每项保存 root id、owner scope/Project/Service、需要该root的`requiredBy` scope集合、绝对 dependency root、manager、manifest/lockfile、当前 manifest/lockfile identity、上次成功 prepared identities、required、status、observedAt 与最小 diagnostic。

scope `dependencies` 继续保留，但只作为该 scope 对应 root closure 的聚合 probe：Service scope聚合自己的闭包，Project/workspace 聚合全部 required roots；没有 roots 时为 `not-applicable`。scope 不复制 root 对象。

“本次是否实际安装”属于 operation effect，而不是长期 current 状态。`prepare` 对每个真正执行 `npm ci` 的 root返回 `dependency-root-prepared` effect；幂等复用不伪造 effect。

### 3. 只有保存过的成功 identity 才能跳过安装

一个 root 只有同时满足以下条件才能复用：

- manifest 与 lockfile 当前存在且 identity 与 prepared identities 相同；
- worktree-local `node_modules` 存在；
- 旧 current 已证明该 root 或 legacy candidate CLI root成功 ready。

仅看到一个预先存在的 `node_modules` 不足以首次认领 readiness。需要准备时通过 Workspace Node absolute npm executable 在 root执行 `npm ci`；成功后重新观察并写 prepared identities。失败保留其他 root 的成功事实，整体 blocked，并把 stderr/stdout 有界截断到该 root diagnostic。

### 4. CLI live inspect 与 Local App saved-current read 分开

Task Environment Application新增 saved-current reader，供 Local App GET和只需保存事实的 consumer使用。公共 CLI `inspect` 在读取 matching current后只读重算 dependency plan并观察 manifest、lockfile、node_modules 与 saved prepared identities；它不执行 npm、不创建目录、不写 SQLite。观察到缺失、声明变化或漂移时，响应顶层 blocked，Receipt current保持不变。

`resolveTaskEnvironmentExecution` 等需要真实执行 readiness 的 consumer继续使用 live inspect。Local App Environment Tab使用 saved-current reader，并明确展示“最近保存事实”，避免GET触发磁盘探测。

### 5. v2 兼容读取，显式 prepare 升级

SQLite table不增加列。repository/domain支持读取 v2 和 v3：

- v2 cleaned Receipt保持可读；
- v2 active/blocked/ready Receipt在 live inspect 中若存在声明式多 root需求，返回 legacy snapshot blocked；
- `prepare` 从v2 scope依赖事实只迁移可证明的 candidate CLI root，其余 roots按声明观察/准备，最终原子写v3；
- Local App saved-current对v2显示 legacy/需要prepare，不在GET迁移。

公开 operation result升级为 `buildr.task-environment-result/v2`，checkout与npm package保持一致。

## Risks / Trade-offs

- [声明文件遗漏导致依赖未纳入] → Product声明覆盖两个Service，并由doctor/static/package contract和Task Environment测试验证；未知required引用 fail closed。
- [旧v2 ready继续被误读] → live inspect保守blocked，只有prepare可写v3；cleaned终态保持兼容。
- [scope与root关系重复或不一致] → root事实唯一，scope只保存由同一plan函数生成的摘要identity。
- [npm ci耗时和失败影响恢复] → 逐根串行、只恢复缺失/漂移root、保留成功现场与逐根effects；不建立后台调度器。
- [Local App与CLI读取结果不同] → 明确区分saved current与live inspection，并用独立Application方法、HTTP/browser测试固定边界。

## Migration Plan

1. 先交付声明 parser/domain与Product `task-environment.yml`。
2. 增加Receipt v3 normalization/read model，同时保留v2只读decoder。
3. 将prepare改为逐根计划/观察/安装/聚合并写v3；将inspect改为只读live依赖观察。
4. Local App切到saved-current reader并展示root列表。
5. 更新public schema、package parity、fixtures和fresh worktree journey。
6. 回滚代码时v3 current会被旧runtime拒绝，因此发布前必须通过candidate/package parity；不以双写v2作为回滚手段。

## Open Questions

无。其他package manager和独立Git sibling Service闭包留给后续Change；首版遇到显式required但不受支持的manager或执行根时blocked。
