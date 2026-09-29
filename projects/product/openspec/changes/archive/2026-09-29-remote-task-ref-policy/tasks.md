## 1. 规则与技能

- [x] 1.1 核心规则源 `resources/workspace/AGENTS.md` 新增远端任务引用授权不变量。
- [x] 1.2 `task-finish` 远端临时分支节改为授权驱动，补枚举路径与推送时生命周期绑定。
- [x] 1.3 `git-operations` 增加 `delete-remote-ref` 操作（Operation）及其安全语义。

## 2. 契约与说明

- [x] 2.1 `contracts/buildr/git-operations/v1.md` 与 `contracts/buildr/task-finish/v1.md` 同步授权与保证文本。
- [x] 2.2 `knowledge/docs/architecture/task-system.md`、`knowledge/docs/guides/getting-started.md` 授权表述同步。

## 3. 验证

- [x] 3.1 `openspec validate remote-task-ref-policy --strict` 与 `buildr openspec convergence preflight` 通过。
- [x] 3.2 核对修改一致性：不变量在规则层、方法在技能、执行原语在提供者，三处表述不冲突。
