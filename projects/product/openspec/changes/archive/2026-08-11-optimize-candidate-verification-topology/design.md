## Context

GitHub Actions 先用 `actions/setup-node` 选择 Host Node，但 `npm run test:candidate` 随后通过 `run-workspace-node.mjs` 切换到 Workspace 声明的受管 Node。因此当前 24.15.0/24.x 两组完整 Candidate 并没有形成两份不同 Node runtime 的完整证据，只重复了操作系统级完整验证。另一方面，Candidate 的 `system` step 在一个 `node:test` 进程中持有全部 System 文件和 `workspace-saturating` 资源；资源受限 CI 只能把整个 step 的 inner concurrency 降到 1，轻量测试无法在重型生命周期期间穿插。

现有验证已经具备 DAG、step 资源、inner concurrency、timing、单次 tarball 和 Task lifecycle 只读基线。本次应复用这些机制，不引入第二个 CI/test runner 或共享可变 Workspace。

## Goals / Non-Goals

**Goals:**

- 用最低 Host Node 与当前 Host Node 的独立证据真实表达 `>=24.15.0 <25` 支持范围，同时只在每个桌面平台运行一次完整受管运行时 Candidate。
- 让每个 System 文件恰好归属一个 Candidate primary owner，并让 scheduler 看见资源差异、独立 timing 和失败含义。
- 消除测试 controller 的重复依赖安装，复用只读、不变输入，同时保持所有被测可变状态隔离。
- 保持 fast、changed、focus、candidate 和直接 `test:system` 入口的既有职责。

**Non-Goals:**

- 不修改正式 tag/npm publish workflow；不可变发布物 authority 由独立 Task 处理。
- 不改变 Node engines 范围或受管 runtime 固定版本。
- 不在没有多轮绿色数据前调整 Candidate/System 非阻断预算。
- 不通过删除 System 场景、降低断言或共享 SQLite/Git/Task/App runtime 状态缩短耗时。

## Decisions

### 1. 最终 Candidate 使用四个语义明确的作业

`dev -> main` 与手工候选验证运行：

1. macOS / Host Node 24.15.0：`npm ci`、Host Node compatibility、受管 runtime prepare、完整 Candidate。
2. Windows / Host Node 24.15.0：同上。
3. macOS / 当前 Node 24.x：`npm ci`、Host Node compatibility。
4. Windows / 当前 Node 24.x：同上。

最低版本 compatibility 直接并入两个完整作业，避免再建立两个只重复 checkout/npm ci 的短作业。完整 Candidate 必须输出并断言受管 Node identity；Host Node compatibility 必须直接使用 `process.execPath`，不得经过 `run-workspace-node.mjs`。

保留 Windows PR 的两版本平台预检。`main` push 不再重复同一 tree 的完整 Candidate；branch protection 在新 check names 首次出现并通过后单独更新。

备选方案是保留六个作业，优点是 check name 完全正交，缺点是最低版本额外重复两次 checkout/npm ci，未增加支持范围证据，因此不采用。

### 2. Host Node compatibility 是独立 verification profile

新增 `host-node-compatibility` profile/入口，只组合 Node 版本敏感且可在数分钟内完成的证据：

- engines 与当前 `process.versions.node` 契约；
- candidate tarball 的 pack/install；
- 安装后 CLI `--help`、`init`、`doctor`；
- Node SQLite、Process、Filesystem/路径与子进程边界的定向测试。

它不是完整 Candidate、Windows 平台预检或正式 release smoke，不承担 runtime adapter 全矩阵、Task Finish、Worktree、Web fresh build 等证据。

### 3. System 文件归属清单是单一调度事实源

新增 System suite registry，逐文件声明 primary owner、Candidate step、默认/CI inner concurrency 与资源。`test/verification/system.mjs` 从同一 registry 展开全部 System 文件，保持直接 System 入口；Candidate registry 从该 registry 生成多个 step，避免复制文件列表。

第一版 owner 采用以下资源边界：

- `system-verification-contracts`：验证规划、timing、JSON/contract 等隔离型场景；可有界并发。
- `system-workspace-lifecycle`：会修改独立 Workspace、Git 或 SQLite 的 Product/Task lifecycle；并发 2。
- `system-runtime-recovery`：CLI install/update、managed runtime 与恢复；持有 `workspace-saturating`。
- `system-local-app-http`：HTTP server/session 场景，独立 App Data 和端口。
- `system-app-process`：launcher/preview/进程状态，持有独占 App runtime 资源。
- `system-task-finish`：Task Finish 公共交付生命周期，持有 task lifecycle 资源。
- `system-fresh-build`：真实双 Service `npm ci` 和 `build:web`，独占构建资源、并发 1。

registry contract 必须证明所有 `test/system/*.test.mjs`（明确排除的 standalone 文件除外）恰好出现一次，Candidate owner 不遗漏、不重复。Windows 定向预检仍可跨 owner 选择高风险文件，但只作为辅助平台证据，不改变 primary owner。

备选方案是只把 monolithic System concurrency 从 1 调回 3；它无法表达 runtime/build/App process 争用，也会重现 EPERM/timeout，因此不采用。

### 4. `workspace-product` 按行为边界拆分，共享无状态 helper

原文件拆成 manifest/registry、runtime recovery、Local App HTTP、App process/preview 四组。共享 helper 只提供纯路径解析、临时 root、CLI invocation 和 fixture materialization；不得保存全局 `TEST_APP_DATA` 或跨文件复用可变 runtime。

每个测试显式取得自己的 App Data、Workspace、SQLite、Git 和端口，并通过 `t.after` 恢复环境与停止进程。HTTP 与 process owner 可分别调度，不再被一个大文件整体串行。

### 5. 只复用不可变输入，不复用被测状态

Candidate tarball、Task lifecycle baseline、已安装 controller dependencies 和不验证 fresh build 的 Web dist 可以只读复用。`task-environment-fresh-build-web` 使用当前已准备的 controller CLI，不再复制 controller 后额外执行一次 `npm ci`；被测 Task Environment 中的 Buildr/Buildr Web 仍各执行真实 `npm ci`，并真实执行一次 `build:web`。

禁止共享 `.buildr`、SQLite、Git worktree、Task/Finish、Local App runtime state 或任何测试会写入的 Workspace。

## Risks / Trade-offs

- [Risk] Host compatibility 入口意外经过受管 Node，继续产生假矩阵 → 输出并断言 Host/managed 两种 Node identity，契约测试检查 workflow 命令边界。
- [Risk] System 拆分遗漏或重复文件 → 由单一 suite registry 和完整性测试在执行前 fail closed。
- [Risk] 并发场景仍共享 process.env/App Data → workspace-product helper 不保存可变全局值；每个测试显式隔离并增加并行重复回归。
- [Risk] controller 复用掩盖 fresh install 缺陷 → 只复用测试 harness controller；被测两个 Service 的无 `node_modules` 前置断言、两次 preparation execution 和真实 Web build 保持不变。
- [Risk] 新 check names 暂时不满足旧 branch protection → 新 workflow 绿色后再更新保护规则；更新前不合入 `main`。
- [Trade-off] 同 tree 三轮绿色运行仍消耗 Runner → 这是一次固定验收实验，不在轮次间修改代码；后续发布只保留一次最终候选门禁。

## Migration Plan

1. 先实现 Host compatibility 入口与 workflow 契约测试，再调整最终矩阵。
2. 引入 System suite registry，先让 monolithic `test:system` 使用新 registry 并证明文件集合不变。
3. 拆分 Candidate System steps 和 `workspace-product`，运行每个 focus owner及并行重复测试。
4. 移除 controller 重复安装，保留 fresh-build 行为断言。
5. 冻结 tree，运行 fast/affected、Windows preflight和三轮相同 tree Candidate timing；最后更新 branch protection。

回滚时可恢复旧 workflow 与 monolithic Candidate `system` step；测试文件拆分不改变产品数据，无数据迁移。

## Open Questions

无。正式发布 tarball workflow 和预算校准明确留给后续 Task。
