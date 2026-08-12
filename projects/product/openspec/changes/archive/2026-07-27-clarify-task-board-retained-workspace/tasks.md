## 1. 契约与指导

- [x] 1.1 更新 `task-board` Skill，明确 retained Workspace 唯一写入 authority 和 task environment 非所有权。
- [x] 1.2 更新 `buildr.task-board-maintenance/v1` contract 与 canonical specs，覆盖从 task environment 调用时的解析和禁止写入规则。

## 2. 投射与回归

- [x] 2.1 增加 task-board contract test，防止 environment-local 看板语义回归。
- [x] 2.2 同步 Buildr package/runtime 投射，核对 source 与投射一致。

## 3. 验证与知识

- [x] 3.1 完成 Brief/current knowledge impact evidence，并运行 OpenSpec strict validation。
- [x] 3.2 运行相关 contract tests、Buildr doctor 和适用的最终验证。
