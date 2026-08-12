## 1. Environment 与 runtime evidence

- [x] 1.1 扩展 runtime adapter plan/check evidence，输出 task adoption 所需的 runtime source root、projection identity、activation modes 与 guidance，并覆盖 Codex `path-read/session-start` 边界测试。
- [x] 1.2 扩展 task environment 本机 schema 与 receipt，建模 runtime expectation、session adoption receipt、assurance 和 stale/blocked 状态。

## 2. Session adoption lifecycle

- [x] 2.1 实现 checkout-local session adoption CLI，校验 environment、owner Agent、session root/handle、adoption mode 与 runtime identity，并原子保存 local receipt。
- [x] 2.2 更新 `worktree create/inspect/context`，在未采用、已采用、identity 漂移和 legacy receipt 场景返回确定性 evidence、状态与 next actions。
- [x] 2.3 更新 task environment cleanup，使 adoption state 只随通过既有安全门禁的 environment 清理，并保持 retained checkout runtime sync 边界。

## 3. Agent workflow 与 current knowledge

- [x] 3.1 更新 `buildr.task-worktree-lifecycle/v2` contract、`task-worktree` provider 与 OpenSpec/task consumers，在 implementation 写入前要求 adopted session evidence。
- [x] 3.2 更新公开 runtime/task workflow 文档和受影响 current knowledge，明确 `buildr-verified` 与 `agent-attested` assurance、Codex session-start 和 retained checkout sync 边界。

## 4. 验证

- [x] 4.1 增加 unit/integration/contract tests，覆盖 adoption 成功、只切换 `cwd`、缺失 host evidence、runtime/plan/session 漂移、legacy receipt 与 cleanup。
- [x] 4.2 运行 OpenSpec strict validation、proposal baseline/check、Buildr affected verification，并核对最终 change status、knowledge evidence 与 observation absorption。
