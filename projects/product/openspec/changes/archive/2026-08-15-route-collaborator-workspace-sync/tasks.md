## 1. 路由契约

- [x] 1.1 更新 Buildr runtime Skill，明确协作者 Git update、Doctor 与 workspace sync 的排他路由
- [x] 1.2 更新 task-triage Skill，在新 Task 创建前 tree transition 中消费该路由且不误用 self-bootstrap
- [x] 1.3 收紧 workspace-owned self-bootstrap Skill 的适用性说明，无 matching Finish Result 时返回普通 Workspace update 路由

## 2. 验证与当前认知

- [x] 2.1 增加 Skill 路由契约测试，覆盖无 matching Finish、matching Finish、sync-only Doctor 和非 sync blocker
- [x] 2.2 运行受影响测试，并核对 capability manifest、runtime projection 与 packaged Skill 一致
- [x] 2.3 收敛 Change、current knowledge 和术语影响，完成 strict validation 与 archive readiness
