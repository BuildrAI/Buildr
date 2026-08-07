# 并行 Local App Changes 依赖说明

记录 `migrate-local-app-to-react` 与其它 active/recent Local App Changes 的关系。**本文是文档结论，不代替那些 Change 的 Finish。**

观测时间：OpenSpec propose 之后、实现开始之前（以 worktree 内 `openspec list` 为准）。

## 现状快照

| Change | 进度（观测时） | 与本迁移关系 |
|--------|----------------|--------------|
| `local-app-direct-tab-reads` | Complete | Task 详情三专业页签应直接读各自 Application；本迁移 UI 必须遵守，不得恢复完整 terminal 聚合依赖 |
| `local-app-read-store-boundary` | 6/7（余 Delivery/handoff 类收尾） | 已登记 Workspace 的只读 Task 路径不应再触发 Git/worktree provenance；本迁移不得在 React 客户端或 HTTP 读路径引入 path/root 查询 |
| `associate-local-change-with-task` | Complete | Task-scoped Change 路由与引用模型保持；G1 清单依赖此模型 |
| `make-workspace-sync-upgrade-compatible` | Complete | 无直接 UI 阻塞 |

## 对实现顺序的文档约束

1. **Shell / Projects / Services / Articles 切片**  
   不依赖上述未完成交付；可在开发授权后按 tasks 推进。

2. **Task 详情切片（F*）**  
   - MUST 以 Application read model 为唯一数据入口（与 `local-app-direct-tab-reads` 一致）。  
   - MUST NOT 在读路径依赖 Git observation（与 `local-app-read-store-boundary` 方向一致）。  
   - **建议：** 若 `local-app-read-store-boundary` 仍未 Finish，实现 Task 详情前先确认 retained 上 Application 行为已是目标契约，或等待其 Finish，避免双线语义漂移。

3. **本 Change 的 OpenSpec**  
   不修改上述 Change 的 delta；冲突时以 canonical + 已收敛 Change 为准，再更新本 Change 文档。

## 开发授权后的核对动作（仍属实现前检查，非本文完成条件）

- [ ] 再次 `openspec list`，更新本表进度  
- [ ] 若 `local-app-read-store-boundary` 仍未完成，书面记录 Task 详情是否延期或基于当前 Application 快照推进  
- [ ] 将结论记回 [brief.md](brief.md)「受影响范围」一行（若有变化）
