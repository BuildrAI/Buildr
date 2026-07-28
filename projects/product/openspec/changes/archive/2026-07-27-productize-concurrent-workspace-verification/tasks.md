## 1. 正式验证 runtime

- [x] 1.1 为现有 Project verification parser、planner、DAG scheduler、executor、resource coordinator 和 evidence builder 建立 characterization tests
- [x] 1.2 将通用验证原语迁入 `src/application/verification`，并让 Product checkout-only verifier 通过薄 adapter 复用生产实现
- [x] 1.3 实现 policy selection、依赖/环检测、显式 supersedes 与 affected/Candidate 完整性判定
- [x] 1.4 实现同 run 并行、四类 resource strategy、Git common-dir 跨进程 lease、heartbeat/expiry/精确释放和异常 worker 清理
- [x] 1.5 实现绑定 Project、task environment、repository candidates、cwd、真实 wall-clock 与 lifecycle 的 `evidenceIdentity` 和版本化 summary

## 2. CLI、provider 与发布闭包

- [x] 2.1 实现 `buildr verification run` 参数解析、Project/context binding、人类输出、退出语义与 `buildr.verification-run/v1` JSON
- [x] 2.2 更新 command/help/schema registries、公开 JSON coverage、CLI reference 和 JSON contract 文档
- [x] 2.3 让 task-verification/Task Finish formal-assurance provider 使用 production executor 执行、核对和清理 evidence，并覆盖 reuse/invalidation/invocation count
- [x] 2.4 更新 npm runtime inventory 与 package parity，确保 tarball 包含 `src/` 验证闭包且不依赖 `test/verification`

## 3. Task-owned runtime 所有权闭环

- [x] 3.1 扩展 task preview metadata，记录 task、environment、owner、receipt、repository set 与受管进程 identity
- [x] 3.2 让 `app preview stop` 对 task preview 核对 receipt-bound caller 和完整 ownership，保持 retained standalone preview 兼容
- [x] 3.3 为 worktree cleanup 增加 preview/process/lease preflight，运行中或归属不明时在任何 Git 删除前 fail closed
- [x] 3.4 增加正确 owner、错误 owner、旧 metadata、运行中 preview 阻止 cleanup 和资源已清理后成功的单元/CLI 集成测试

## 4. 组合与安装后验收

- [x] 4.1 修复双任务 Candidate fixture，使 formal-assurance 消费 production summary 的真实 `evidenceIdentity`
- [x] 4.2 扩展双任务验收，覆盖正式 verification CLI、worker 重叠、coordinated 等待、错误 owner、提前 cleanup 拒绝与最终产品化清理
- [x] 4.3 增加普通临时 Workspace + 外部 tarball CLI 的双 task E2E，证明无开发 checkout 依赖的 policy 执行、资源协调和 JSON parity
- [x] 4.4 运行验证 runtime 单元测试、CLI/Task Finish/preview/worktree 集成测试、双任务组合验收与 package smoke

## 5. 当前认知与交付收敛

- [x] 5.1 更新 `docs/buildr-product.md`、Service CLI/验证文档和 runtime Skill/contract 指引，简明说明通用并发验证边界
- [x] 5.2 根据最终实现 reconcile `openspec/knowledge/architecture/technical.md` 与 `openspec/knowledge/services/buildr.md`，并完成 terminology 检查
- [x] 5.3 运行 runtime sync/doctor、OpenSpec proposal/strict guard、current-knowledge inspect 和最终 Candidate evidence 审计；canonical convergence 留给 Task Finish 的单一事务
