# Design: git 来源代码库登记默认异步克隆

## 决策

### 1. 克隆所有权在 workspace 模块，源代码管理只是触发与观察入口

登记语义（repositories/manifest.yml、来源身份）属于 `modules/workspace`；克隆是登记产物化的动作，触发点应紧贴登记写入。`modules/code` 已 `requires` `WORKSPACE_APPLICATION`，可把克隆状态并入 `sourceControlInventory`，并提供 `POST /code/repository-clone` 作为源代码管理页的唯一操作入口——与「代码入口统一」一致，不在 workspace HTTP 另开动作。

### 2. 异步执行器：进程内 Clone Supervisor（内存态）

新增 `RepositoryCloneSupervisor`（workspace 模块 application 层）：

- `ensure(root, repository)`：幂等发起。目标目录已存在真实 `.git`/目录 → 记为已准备直接返回；该实例已有 running → 直接返回；否则 `spawn('git', ['clone', '--branch', <integrationBranch>, '--single-branch', <url>, <location>])`（无 integrationBranch 时不带 `--branch`）。
- 状态 Map：`running | failed(error) | ready`；`ready` 成功后短窗口保留即清除，真实来源以目录存在为准。
- 输出：`status(root, repositoryId)` 供源代码管理清单合并；`request(root, repositoryId)` 供显式克隆入口调用，语义同 ensure，重复 running 时返回 `already-running`。
- 失败：`exit code != 0` 时记录 stderr 末尾行；`destination path ... already exists` 视为收敛为已准备而非失败。
- 不持久化、不跨进程恢复：进程重启后状态清空，缺失目录按既有「缺失」语义呈现，可再点克隆。这符合「失败不否定登记事实」并保持实现与领域一致——克隆是把来源物化到本机，git 自身是唯一权威。

并发：同一实例互斥；全局不加额外上限（clone 已按实例去重，实际并发量受登记动作数限制）。

### 3. 自动触发点（三处，登记提交成功后）

`asset-relationships-application.ts` 收集 mutate 回调内新建的 git 来源实例，在 mutate 返回成功后调用 `supervisor.ensure`：

- `createCatalogRepository`（代码库独立新增）
- `addService` 的 `raw.repository` 分支（服务新增内嵌；含 `createCatalogProject` 的 `newServices` 路径，项目创建内嵌自动覆盖）
- 不触发：`addService` 的 `directoryMode` 隐式建库分支——它按既有目录自动识别，不是 git URL 来源，不属于本需求。

触发是「登记事实成立后的副作用」：mutate 内只收集实例，成功提交后才发起，避免失败回滚后留下孤儿克隆。

### 4. 契约与前端

- `workspace-http-contracts`：无新增（登记响应不新增克隆承诺字段，克隆状态由源代码管理读取）。
- `code-http-contracts`：新增 `code.repositoryClone`（`POST /code/repository-clone`，body `{repositoryId}`），响应 `{status: 'started'|'already-running'|'ready', diagnostic?}`。
- `CodeSourceControlRepository` 增加 `clone: {state: 'cloning'|'failed'|null, diagnostic}`（仅在实例目录缺失时有意义）。
- 前端源代码管理页：缺失/克隆中/失败实例展示对应状态与「克隆到本地」按钮；点击 POST 后轮询既有 `sourceControlInventory` 刷新；克隆中按钮禁用，失败显示诊断。

## 不做的事

- 不做跨进程持久队列与断点续克隆；不做凭证管理。
- 不加「仅登记不克隆」选项；已在 spec 明确。
- 不为旧 legacy 目录服务补克隆。
