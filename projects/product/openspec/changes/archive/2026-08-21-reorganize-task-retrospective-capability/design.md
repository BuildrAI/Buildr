## Context

Task Retrospective 已有稳定的 Domain 校验、Application writer、SQLite Repository、bundled `__internal task-retrospective` runner 和 Buildr Web GET/PATCH 行为，但实现分布在 `src/domain/task-retrospective`、`src/application/task-retrospective`、`src/task/persistence/retrospective` 与 `src/interfaces/internal`。Repository 由全局 Task persistence 聚合注册，Application 由 legacy runtime 注册，HTTP Host 直接实现 Retrospective 路由，因此能力归属和唯一装配入口不清晰。

Task Record 与 Task Review 已证明 `src/task/module.mjs` 可以在保持兼容方法的同时提供窄 Application、Persistence Read 与 HTTP contributions。本切片复用该模式，并遵循 Task 技术层内 flat-first 的当前架构约定。

## Goals / Non-Goals

**Goals:**

- 将 Task Retrospective Domain、Application、Persistence、Internal/HTTP Interfaces 放入 `src/task` 对应技术层，移除单文件能力子目录。
- 由 `src/task/module.mjs` 唯一组装 Repository 与 Application，并向 Bootstrap 提供窄能力端口、HTTP contribution 和内部 workflow runner。
- 从 legacy persistence/application registration、HTTP Host 硬编码路由与旧 internal driver 路径移除第二套入口。
- 保持报告、处置状态、CAS、终态校验、事务、公开接口与 Application Payload 行为等价。

**Non-Goals:**

- 不修改 Task Retrospective Result、处置状态或公共 JSON schema，不新增 SQLite migration。
- 不改变 `task-retrospective` Skill、capability contract、Task Record 来源关系或生命周期门禁语义。
- 不修改 React/Vite 前端源码、Web Session/安全边界或其他 Task 专业能力。
- 不借本切片把触达文件转换为 TypeScript；文件保持 `.mjs`。

## Decisions

### 1. 使用独立 Task Retrospective module descriptor

`src/task/module.mjs` 新增 `task-retrospective` descriptor，并在 Task Record 之后、依赖它的 Task Verification/Development 之前安装。descriptor 显式依赖 Task Record Application/Persistence Read 与 Workspace structured store，在私有 composition 内注册 Retrospective Repository 和 Application。

相较继续由 `registerTaskPersistence` 与 legacy runtime 分两阶段注册，独立 descriptor 能让 writer、依赖和 adapter 由一个模块入口组装；相较新建 `task/retrospective/module.mjs`，单一 `task/module.mjs` 符合当前 flat-first 约定。

### 2. 只公开 Application、Persistence Read 与受限兼容端口

模块公开：

- `task-retrospective.application`：`inspect`、`list`、`record`、`handle`；
- `task-retrospective.persistence-read`：locator 与 current row 只读方法；
- `task-retrospective.bootstrap-compatibility`：只供未迁移 runtime consumer 与现有 fault-injection tests 使用，并声明 owner、scope 与最终退出条件。

Repository writer 保持模块私有，HTTP、Skill、内部 runner 与其他 lifecycle consumer 继续只调用同一个 Application。兼容端口只投射同一实现，不建立第二套状态、事务或 writer。

### 3. Internal driver 收敛为一个可导入且可执行的文件

将 wrapper 与 runner 合并为 `src/task/interfaces/internal/task-retrospective-driver.mjs`：文件导出 `runTaskRetrospectiveDriver` 供 bundled route 使用，并只在作为直接 Node 入口时读取 `process.argv` 和设置退出码。`src/task/module.mjs` 重新导出该 runner，公共 internal workflow router 只依赖模块入口。

该方案保留 npm Application Payload 的动态 Bootstrap 创建和现有 CLI JSON/exit code；不保留旧路径转发文件，避免长期双入口。

### 4. HTTP 行为改由模块 contribution 提供

新增 `src/task/interfaces/http/task-retrospective-http.mjs`，识别既有 `/tasks/:id/retrospective` GET/PATCH，复用 HTTP Host 提供的 write authorization 与 closed body reader，再调用模块 Application。HTTP Host 删除硬编码 Retrospective 分支，只负责公共 query、session、origin、body-size 与 response 映射。

### 5. Prompt 常量并入 Retrospective Application 文件

现有 `src/application/task-retrospective-prompt.mjs` 只导出与能力绑定的纯常量，且被 Task Record/Finish consumer 直接引用。迁移时将常量并入 `task-retrospective-application.mjs` 的导出，consumer 更新为新模块路径，不再保留额外的全局 Application 文件。

## Risks / Trade-offs

- [模块安装顺序错误导致 Application 缺少 Task Record 或 structured store 方法] → descriptor 显式声明 required capabilities，Bootstrap registry 在安装时 fail closed，并用 module snapshot/缺依赖测试固定顺序。
- [HTTP Host 与 contribution 同时匹配导致重复写入] → 原硬编码 GET/PATCH 分支与旧 Application registration 同步删除，由 contribution identity 唯一性和 system journey 覆盖。
- [合并 wrapper/runner 造成被 import 时意外执行] → 使用直接入口身份判断，仅直接运行时消费 `process.argv`；bundled route 只调用导出函数。
- [路径移动导致 Verification 漏选或 payload 缺文件] → 原子更新 verification registry、static validation、package installed-layout 与 internal workflow route tests。
- [未迁移 runtime consumer 仍依赖宽方法] → 兼容端口投射同一 Application/Repository 实现，并由后续 consumer migration 与 `legacy-exit-and-conformance` 删除。

## Migration Plan

1. 在 `src/task` 扁平技术层移动 Domain、Application、Repository、Internal driver，并新增 HTTP adapter。
2. 扩展 `src/task/module.mjs` 与 Bootstrap 安装顺序，提供 Application、Persistence Read、HTTP 与 runner 入口。
3. 删除 legacy persistence/application registration、HTTP Host 分支、旧 internal files 与旧 prompt 文件，更新所有 imports。
4. 更新 Verification owner、架构/static/package checks 和相关 unit/integration/system tests。
5. 运行 strict OpenSpec、typecheck、架构、Task Retrospective、HTTP、public JSON、Application Payload 与 package affected 验证。

验证失败时回滚本 Change 的源码移动和装配改动即可；没有数据迁移、双写或 schema 回滚。

## Open Questions

无。
