# 清退遗留 Task 文件目录

## 一句话摘要

在全部 Task current facts 已进入 Workspace SQLite 后，退出 `.buildr/tasks/` 的一次性 Environment 文件导入与文件 authority，让正常 runtime、sync、Agent 和 Local App 只消费 SQLite。

## 背景与问题

Task、Development、Review、Verification、Environment、Lifecycle 与 Finish 已分别拥有 SQLite current authority，但 sync 仍扫描旧 `environment.json`，contracts、Skills 与说明仍保留文件迁移语义，自举 Workspace 也残留已跟踪 YAML 和 ignored Receipt。该兼容边界让已经 inert 的文件继续影响产品理解和维护。

## 目标

- 删除两条一次性 Task Environment migration 和 sync 的旧 authority 扫描。
- 让 Task Environment 公开契约、Skill、CLI、架构和 Service 说明只指向 SQLite locator。
- 删除自举 Workspace 已退出的历史 Task YAML，并在集成后受控清理本机旧 Receipt。
- 保持现有 SQLite schema、Application API、Local App read model 与 Git evidence 不变。

## 非目标

- 不增加自动递归删除、通用清理 framework、第二 writer、retention 状态或数据库表。
- 不让 sync 删除未知用户文件、修改 Git index 或清理其他 `.buildr/` 内容。
- 不移除 `/.buildr/tasks/` ignore 升级兼容护栏。

## 受影响用户或角色

- Workspace owner：旧目录不再被 Buildr 消费，可以在确认 SQLite current 后自行删除。
- Agent：只能通过 Task Environment Application 与 `workspace-sqlite:task-environment/<task-id>` 使用 Environment current。
- Buildr 维护者：sync、contracts、Skills、测试和 current knowledge 不再维护一次性 importer。

## 核心流程

1. Task Environment prepare/inspect/cleanup 直接读写 `task_environment_current`。
2. Workspace sync 不扫描或解析 `.buildr/tasks/`。
3. 升级后仍存在的旧文件保持 inert，不会 fallback、导入或阻塞 SQLite mutation。
4. Workspace owner 在确认 SQLite current 后自行清理旧目录；Buildr 不替用户猜测未知文件 ownership。

## 关键变化

- 删除旧 v1 receipt migration、Environment current file importer、注册、sync 调用和专用测试。
- 删除 importer Requirements，保留 SQLite current schema 与 reader/writer 契约。
- 更新 capability contract、Skills、CLI、技术架构、Service knowledge 与术语定义。
- 删除本仓 Git 已跟踪的历史 Task YAML；broad ignore 继续防止旧本机 bytes 意外进入 Git。

## 影响、风险与兼容性

这是明确的兼容入口退出：尚未完成 Environment SQLite migration 的旧 Workspace 必须先使用仍含 importer 的版本执行 sync。升级后旧文件不会自动删除，也不会再影响 Buildr；这避免 sync 扩大为未知文件清理器。

## 验收摘要

源码和 package 中不再存在 Environment file importer 或 sync 扫描；Task Environment 所有公开说明只指向 SQLite；OpenSpec strict validation、受影响单元/集成/package 测试通过；Git tree 中不再跟踪 `.buildr/tasks/` 历史文件。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [Task Environment delta](specs/task-environments/spec.md)
- [Workspace Structured Store delta](specs/workspace-structured-data-store/spec.md)
- [tasks.md](tasks.md)
