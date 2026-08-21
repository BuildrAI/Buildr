## Context

Task Record、Review 与 Retrospective 已经迁入 `src/task`，并分别通过 `src/task/module.mjs` 的 descriptor 组装。其余 Task 核心仍由 `bootstrap/legacy-runtime-module.mjs` 直接注册：业务 Domain/Application 位于全局目录，Persistence 又按能力子目录聚合在 `src/task/persistence/index.mjs`，CLI 和 internal drivers 位于全局 `src/interfaces`，Buildr Web 读写入口通过宽 runtime methods 访问这些能力。

这些能力并非一个业务 writer：Environment、Development、Verification、Execution Record 等各自拥有独立 Receipt/Result 和事务边界；但它们形成稳定依赖图，并共同服务 current Task 入口、Overview 与 Parent Coordination。分成更多 Child 会反复修改同一 Bootstrap、CLI、HTTP、payload 和 verification registry，因此本次作为一个结构迁移闭环实施，同时保留各专业 Application 的独立 authority。

## Goals / Non-Goals

**Goals:**

- 将 Task Environment、Development、Verification、Execution Record、Planning Identity、Entry Snapshot、Overview 与 Parent Coordination 的生产实现迁入 `src/task` 对应技术层，层内 flat-first。
- 在单一 `src/task/module.mjs` 入口中用多个窄 descriptor 表达专业能力及依赖顺序，不把 Task 生命周期合并成一个 writer。
- 让 CLI、HTTP 和 retained internal workflow 从 module contributions/ports 接入，退出 legacy runtime 与 Host 的直接内部 import/registration。
- 保持所有公开接口、持久化、事务、状态与副作用语义等价，并让 Application Payload、Verification owner 和服务架构文档反映真实路径。

**Non-Goals:**

- 不迁移 Task Finish、Terminal Delivery、Delivery Carrier、Activation、Cleanup 或 Finish recovery 的实现和副作用 ownership。
- 不重新实现或重新分组已迁移的 Task Record、Review、Retrospective。
- 不修改公开 CLI/HTTP/JSON、Receipt/Result schema、SQLite schema/migration/checksum、状态机、风险接受或验证选择语义。
- 不迁移 HTTP 公共宿主、Session、安全边界、静态文件托管或 sibling `buildr-web` 前端。
- 不借结构迁移批量转换未触达代码；机械移动的现有文件继续使用 `.mjs`。

## Decisions

### 1. 一个 Task 模块入口，多个专业 descriptor

`src/task/module.mjs` 继续是 Bootstrap 唯一 Task 模块入口，但新增 Environment、Execution Record、Verification、Planning Identity、Development、Parent Coordination、Overview 与 Entry Snapshot 等独立 descriptor。每个 descriptor 私有组装自己的 Repository 与 Application，只公开必要 Application/read port、CLI/HTTP/internal contribution 和受限 compatibility port。

相较建立 `task/environment/module.mjs` 等对称子模块，该方案保持用户确认的“技术层内直接放文件”结构；相较一个 `task-lifecycle` 大 descriptor，多个 descriptor 能保留缺失依赖 fail-closed、独立 writer 和清晰安装顺序。

### 2. 以真实依赖图安装，不复制跨专业事实

Bootstrap 先安装 Task Record，再安装 Environment 与 Execution Record；随后安装 Review/Retrospective、Verification、Planning Identity、Development、Parent Coordination、Overview 与 Entry Snapshot。模块间只通过显式 capability port 协作：Development 消费 Environment、Review、Verification 与 Planning Identity 的公开能力；Parent Coordination 消费 Task Record、Development 与 Review；Overview 和 Entry Snapshot 只组合 owner read model。

Repository writer 始终留在所属 descriptor 私有 composition。跨模块 consumer 不直接读取其他能力的 SQLite row/Mapper，也不在 Task 模块建立新的聚合 store。

### 3. 技术层 flat-first，文件名表达专业归属

迁移后的生产路径直接使用：

- `src/task/domain/<capability>.mjs`
- `src/task/application/<capability>-application.mjs`
- `src/task/persistence/<capability>-repository.mjs`
- `src/task/interfaces/cli/<capability>.mjs`
- `src/task/interfaces/http/<capability>-http.mjs`
- `src/task/interfaces/internal/<capability>-driver*.mjs`

同一能力确有多个紧密协作者时使用不同文件名，而不为单文件能力建立子目录。既有 Task Record 的 `record/` 历史路径不在本 Change 重写；最终一致性任务可在不改变 owner 的前提下单独处理。

### 4. CLI、HTTP 与 internal workflow 通过窄入口接入

现有 `task environment`、`task verification`、`task execution-record`、`task parent` 与 `task next` routes 改由对应 descriptor 贡献，CLI Host 只合并 registry contributions。Task 详情的 Overview、Development、Verification、Coordination 与 Execution Record HTTP 行为由 Task HTTP contribution/port提供业务适配，现有 Web HTTP Host 继续拥有认证、Session、Worker 隔离和通用响应发送。

Task Development 与 Planning Identity 的内部 driver/runner 迁入 `task/interfaces/internal`，正式 Skill 仍只通过 matching retained controller 的 bundled `__internal` route 调用；不会新增公共 Development CLI。

### 5. Finish 集群只作为明确 consumer 保留

Task Finish、Terminal Delivery、Verification execution recovery、Doctor 和其他尚未迁移 consumer 可以暂时取得带 owner、scope 和退出条件的 compatibility methods，但这些方法必须投射同一 Task module Application/Repository 实现。旧 `registerTaskPersistence` 与核心 Application registrations 退出后，不保留转发文件、双注册、双读或双写。

Finish 集群自己的 Domain/Application/Interfaces 不移动；只有 import/port wiring 可因核心 owner 改变而更新。后续 Finish Child 或最终 legacy convergence 删除相应 compatibility surface。

### 6. 行为等价由结构门禁与原 journeys 共同证明

现有 unit、integration、system 与 contract tests 跟随新路径更新，并继续覆盖 Environment prepare/cleanup、Development lifecycle、Verification Result、Execution Record recovery、Planning Identity、Parent Coordination、Overview/Entry Snapshot 与 Web reads。新增 module snapshot、dependency、contribution uniqueness、legacy import absence 和 persistence writer 检查。

Application Payload 继续递归打包 `src` 依赖闭包；verification registry 为 `src/task/**` 选择既有 owner，不新建重复 verification capability。服务架构文档只在实现完成后记录真实迁移状态。

## Risks / Trade-offs

- [风险] 一次迁移多个专业模块，module 安装顺序可能导致运行期方法缺失。→ 用显式 requires/provides 固定依赖图，并以缺失依赖与 runtime snapshot contract tests fail closed。
- [风险] CLI/HTTP Host 同时保留旧 route 与 module contribution。→ 原子删除旧 routes/imports，由 registry 的 contribution identity 唯一性阻止重复注册。
- [风险] Finish、Verification executor 或 Doctor 仍依赖旧宽 runtime methods。→ 只提供同实现 compatibility projection，并用静态调用方检查记录 owner 与退出条件；不移动 Finish 业务实现。
- [风险] Persistence 平铺移动改变相对路径、body storage 或 transaction 使用。→ 机械移动 Repository/Body Store，保持 structured store、transaction callback、locator 和文件原子写入机制不变，并运行 failure/rollback 测试。
- [权衡] 本 Child 修改共享 Bootstrap 和 Host 文件较多。→ 这是八项紧密能力合并迁移的预期成本；隔离 worktree 与单一 Change 保持原子交付，后续并行任务通过 delivery adaptation 处理基线前进。

## Migration Plan

1. 机械迁移 Domain、Application、Persistence、CLI 与 internal interfaces，先修正相对 imports 并保持函数签名。
2. 在 `task/module.mjs` 建立独立 descriptor、ports、contributions 和有限 compatibility projections，按依赖顺序安装。
3. 从 legacy runtime、persistence 聚合、CLI Host 与 HTTP Host 删除核心能力的直接注册和重复 routes；更新剩余 consumer imports。
4. 更新 Application Payload、verification registry、架构门禁、相关测试与 Buildr 服务架构文档。
5. 运行 OpenSpec strict/preflight、typecheck、focused/affected tests 及完整 Product delivery verification；失败时整体回滚本 Change，不保留第二套入口或数据迁移。

## Open Questions

无。Task Finish 集群和 HTTP 公共宿主的最终迁移仍按 Parent Plan 后续贡献独立处理。
