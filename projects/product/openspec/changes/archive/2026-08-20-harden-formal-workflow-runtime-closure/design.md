## Context

Buildr 当前用 application payload root 同时承担受管资源定位与 SQLite writer provenance 观察。`BUILDR_APPLICATION_PAYLOAD_ROOT` 是合法的资源投射机制，却不应成为写入 authority；候选 checkout 只要把该变量指向 npm 安装 payload，就可能把自身伪装成非 Git runtime。另一方面，Task Development 已有 bundled hidden route，而 Task Retrospective 与 Task Planning Identity 的受管消费者仍直连 `src/interfaces/internal/*.mjs`，npm artifact 无法自包含运行这些流程。

Verification execution 已由 Execution Record 保存完整 stdout/stderr，但公共 `--json` 仍重复输出原始字节。Task Verification inspect 则正确地不读取 declaration source，却没有说明 `unknown` 来自哪些未提供事实轴。

本变更横跨 runtime composition、CLI/package、Doctor、SQLite、Verification 与受管 Skill，因此先统一身份、入口和输出边界，再实现。

## Goals / Non-Goals

**Goals:**

- 让 retained store 写入保护只信任实际执行 controller/code source，而不信任资源 payload override。
- 让 npm artifact 自包含 Task Development、Task Retrospective 与 Task Planning Identity 的内部入口。
- 用同一受控 route inventory 驱动 CLI 接线、package validation、Doctor 与 artifact tests。
- 让 Verification 公共 JSON 保持小而可携带，同时保留 Execution Record 的完整诊断事实。
- 让 applicability `unknown` 可解释但不触发隐式文件或 Git 观察。

**Non-Goals:**

- 不修改公开 Task lifecycle authority，不增加新的 gate、store 或 history。
- 不迁移或重绑历史 Environment Receipt；旧 npm 路径失效仍留给独立复现。
- 不改变业务 Verification declaration、测试覆盖策略或 Result 结论。
- 不把内部 workflow routes 宣布为公共稳定 API。

## Decisions

### 1. 资源根与 writer source identity 分离

Runtime composition 将分别提供 resource payload root 与 writer controller source root。前者继续允许通过安装 identity/环境变量定位 Skills、rules、migrations 等只读资源；后者从实际加载/启动的 Buildr controller package 或 checkout 解析，并且没有环境变量覆盖入口。Workspace SQLite 的唯一 writable boundary 只消费 writer source root。

选择该方案是因为 provenance 必须绑定“谁在执行写入”，而不是“它从哪里读取资源”。只在调用点过滤 `BUILDR_APPLICATION_PAYLOAD_ROOT` 仍会留下 CLI、HTTP、Web 或 internal driver 的分叉；继续复用 `productRoot()` 则无法建立清晰 authority。

### 2. 内部工作流统一为 bundled hidden routes

Task Development、Task Retrospective 与 Task Planning Identity 都通过产品 CLI 的 `__internal <route>` 分派到可打包 runner。checkout 内的 source driver 只保留为薄 wrapper，受管 Skills/sidebars 统一消费 matching Environment/Workspace 提供的 retained controller invocation，不再拼接 `src/interfaces/internal` 路径。

hidden route 不升级为公共 CLI；它仍由内部 capability contract、closed input/output 和现有 Task authority 约束。这样既保持内部演进空间，也让 npm 安装产物能够自洽执行。

### 3. route inventory 同时服务构建期与运行时诊断

产品维护单一必需 internal workflow route inventory。Package static validation 检查受管消费者引用与 inventory 一致；installed-layout tests 从实际 tarball 启动所有 route，并至少覆盖 Retrospective writer 与 Planning Identity reader 的真实 fixture。Doctor 对当前 runtime 的 inventory/consumer closure 做只读检查，缺失或漂移时返回稳定 finding。

单纯复制缺失 driver 到 tarball 无法防止下次新增 consumer 再次漂移；只做 Doctor probe 又无法证明发布 artifact。因此两类验证都保留，但共享同一 inventory，避免第二套 authority。

### 4. Verification 内部执行事实与公共投影分离

Runner 内部 check 继续持有 stdout/stderr，以便 seal Execution Record 与形成失败诊断；公共 `buildr.verification-execution/v1` 只投影 capability identity、outcome、timing、resource/target 摘要和有界 failure summary。完整输出只进入 Execution Record body，Task 外 transient execution 也不通过公共 JSON 回放原始字节。

不发布 schema major 变更：现有 contract 已禁止 raw output，本次是移除误投影字段并补测试，而不是改变 payload authority。

### 5. unknown 以稳定 reason 解释未观察轴

Task Verification inspect 在未显式提供 current target 或 declaration identities 时，分别返回 `target-identity-not-provided` 与 `declaration-identities-not-provided`。Reason 只解释值缺失，不读取 declaration source、Git、Environment 或 Content Target，也不把历史 record 观察伪装为 live current。

## Risks / Trade-offs

- [Writer source root 解析错误导致合法安装 runtime 被拒绝] → 同时覆盖 checkout、npm installed layout、普通用户 Workspace 与 self-bootstrap candidate/canonical topology。
- [hidden route inventory 与动态 import 再次漂移] → CLI、package validation、Doctor 和 tarball executable tests 共享 route identity，并验证实际启动。
- [移除 stdout/stderr 降低即时诊断便利] → 保留有界 failure summary 与 execution record identity，完整正文通过现有 record inspect/readback 获取。
- [新增 unknown reasons 被 consumer 当作 stale] → 保持 axis/overall status 不变，只做 additive reason；增加 Web/Application contract tests。

## Migration Plan

本变更不包含 schema 或数据迁移。先在候选 worktree 完成 source/unit/integration 与 npm tarball 验证，再按正式 Task Finish 集成 retained checkout；随后由唯一 self-bootstrap runner 验证 retained runtime 和 Doctor。回滚只需回退代码与受管资产，不修改既有 Workspace 数据。

## Open Questions

无。历史 Environment Receipt 路径失效的精确根因需另行复现，不阻塞本变更。
