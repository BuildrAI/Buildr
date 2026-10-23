# 设计：工作空间产物登记与生命周期处置

## Context

动机见 proposal.md。约束现状：

- `src/modules/` 按 `module.ts` + `application|domain|infrastructure|persistence|interfaces` 分层组织，CLI 在 `src/bootstrap/cli/registry.ts` 注册并归入 `primary|agent-machine|maintenance` 产品表面。
- `workspace-structured-data-store` 限定 `workspace.sqlite` 只保存 Task Record、Review 与 Verification 域；产物清单不得进入该库。
- `task-environments` 禁止统一 Task Environment、资源注册与总 cleanup；本能力按有界产物清单设计，边界澄清已写成规范增量。
- `managed-data-integrity` 要求写入校验路径身份、ownership 与保护根；清扫删除受其约束。
- Git Worktree provider evidence（`.git` common-dir 下 `buildr/task-worktrees/*.json`）是既有的文件式事实保存先例：不用 SQLite、带 digest。
- 归属任务状态唯一权威是 Task Record（`workspace.sqlite` 只读读取）。

## Goals / Non-Goals

**Goals:**

- 让工作区中间产物"有什么、多大、归谁、能否清"成为确定性可回答的问题；
- 提供逐项核验、计划可审阅的清扫动作，替代纯手工归因；
- 登记是可选描述层，发现层兜底未登记对象。

**Non-Goals:**

- 不做自动无确认删除、不做容量配额或定时清理；
- 不接管 `.buildr/local/task-*` 证据类目录、`.worktrees/`（Git Worktree provider 自有契约）或 Agent 私有目录（如 `~/.codex`）；
- 不建 HTTP/Web 界面、不动 workspace.sqlite schema、不引入统一 Environment 概念；
- 不要求所有产物必须登记，不追溯历史目录的完整来源。

## Decisions

### 文件清单存 `.buildr/local/artifacts/`，不进 workspace.sqlite

每个产物一条 JSON 记录（`registry/<artifactId>.json`，`schemaVersion: buildr.workspace-artifact/v1`），单写者、原子 rename、内容摘要做条件更新——复用 Git Worktree evidence 的文件式事实先例。备选 workspace.sqlite 表与 store 规范的域限定直接冲突，且产物是"可重建的本机事实"而非长期任务事实，文件存储语义更准确。备选独立 SQLite 增加一套迁移资产，收益不抵成本。

### 发现优先、登记补充，处置状态即时计算

只登记无法覆盖真实世界（Agent 会随手建目录），所以扫描声明的 scratch 根并枚举未登记对象是默认路径；登记只补充发现不能推断的事实（disposition、保留引用方）。处置状态（`active|retained|retained-stale|expired|unattributed|missing`）在读取时由登记记录 + Task Record 当前状态 + 文件系统当前观察计算，不落库——避免第二事实漂移。备选"创建时强制登记"会形成新门禁，违反约束局部化原则。

### scratch 根用白名单约定而非 gitignore 推断

`node_modules` 也是 gitignore 项，用 gitignore 推断范围必然误伤。v1 声明的 scratch 根为：Workspace 根 `build/` 与各服务代码检出根的 `build/`；`.worktrees/`、`.git/`、`node_modules/`、`.buildr/local/artifacts/` 与其余 `.buildr/local/` 管理目录全部排除。`.buildr/local/task-*` 证据目录只报告大小，删除须先经显式 `register` 变为受管产物再按正常处置走——保留物"提升"为受管登记的通道由此自然成立，不另建搬迁流程。

### 清扫授权 = 处置状态 + 归属核验 + 范围校验，dry-run 默认

`--execute` 只删除 `expired`（ephemeral + 归属任务终态）或显式 `released` 的项，删除前复核记录版本与路径身份（防 TOCTOU 漂移）；`unattributed` 永不进入删除集，保留引用失效只形成 `retained-stale` 诊断。逐项独立失败隔离，无跨项事务——删除是不可逆副作用，每项都要自证授权。

### 指引进技能，能力进 CLI，不建第二门禁

Agent 如何登记与收尾处置写在 `task-finish` 技能资源里（指引），执行能力在 `buildr artifact` CLI（确定性动作）。任务完成、发布、doctor ready 均不依赖产物处置完成——产物缺口只报告，不阻塞无关工作。

## Risks / Trade-offs

- 目录被外部移动/删除导致登记漂移 → `status` 每次读取重新观察文件系统，漂移如实标 `missing`，不清理登记（记录本身不随目录消失而无罪推定删除）。
- 名称启发式误归属 → 推断归属只用于展示，永不授权删除；删除只认登记或明确核验。
- `build/` 内仍有被引用的保留物被误清 → retained 声明引用方 + 失效只诊断；清扫不认散文式"还在用"，只认登记记录——促使保留者显式登记，这正是本能力要建立的纪律。
- 逐目录 `du` 量级测量在大目录上偏慢 → 扫描按需限定 scratch 根，状态查询默认不强制全量测量（`--sizes` 或 status 时才计算）。

## Migration Plan

新增能力，无迁移。既有未登记目录由 `artifact status` 首次扫描渐进呈现；需要处置的目录由 Agent/人显式 `register` 后走正常生命周期。
