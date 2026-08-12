# 实现任务

- [x] 1.1 为 POSIX verification step 增加运行期间 owned descendant lineage tracker
- [x] 1.2 在 step close/error 后清理原 process group 与仍存活的 tracked descendants，并返回结构化 evidence
- [x] 2.1 增加 detached/reparented descendant 精确回收测试和非 owned 进程保护测试
- [x] 2.2 增加 Task Finish start→persist→completion selector plan 集成测试
- [x] 3.1 更新 Brief/current knowledge impact evidence 并完成 strict validation 与 proposal guard
- [x] 3.2 运行 affected verification，确认无 task-owned Local App fixture 残留
