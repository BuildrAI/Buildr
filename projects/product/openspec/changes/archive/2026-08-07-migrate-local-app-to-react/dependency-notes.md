# 并行 Local App Changes 依赖说明

记录 `migrate-local-app-to-react` 与其它 active/recent Local App Changes 的关系。**本文是文档结论，不代替那些 Change 的 Finish。**

观测时间：实现进行中（worktree 内 `openspec list`，2026-08-07）。

## 现状快照

| Change | 进度（观测时） | 与本迁移关系 |
|--------|----------------|--------------|
| `migrate-local-app-to-react` | active（实现进行中；空壳 + shell 切片已绿） | 本 Change |
| `persist-task-finish-state-in-sqlite` | Complete | 无直接 UI 阻塞；Task 终态/交付投影后续切片须对齐其持久化事实 |
| `local-app-direct-tab-reads` | 已不在 active list（此前 Complete） | Task 详情三专业页签应直接读各自 Application；本迁移 UI 必须遵守 |
| `local-app-read-store-boundary` | 已不在 active list | 已登记 Workspace 的只读 Task 路径不应再触发 Git/worktree provenance；本迁移不得在 React 客户端或 HTTP 读路径引入 path/root 查询 |
| `associate-local-change-with-task` | 已不在 active list（此前 Complete） | Task-scoped Change 路由与引用模型保持 |
| `make-workspace-sync-upgrade-compatible` | 已不在 active list（此前 Complete） | 无直接 UI 阻塞 |

## 对实现顺序的文档约束

1. **Shell / Projects / Services / Articles 切片**  
   不依赖上述未完成交付；可在开发授权后按 tasks 推进。

2. **Task 详情切片（F*）**  
   - MUST 以 Application read model 为唯一数据入口（与 `local-app-direct-tab-reads` 一致）。  
   - MUST NOT 在读路径依赖 Git observation（与 `local-app-read-store-boundary` 方向一致）。  
   - **现状：** `local-app-read-store-boundary` 已不在 active list；Task 详情可按当前 Application 契约推进，仍须避免 path/root 查询。

3. **本 Change 的 OpenSpec**  
   不修改上述 Change 的 delta；冲突时以 canonical + 已收敛 Change 为准，再更新本 Change 文档。

## 开发授权后的核对动作

- [x] 再次 `openspec list`，更新本表进度  
- [x] 确认 `local-app-read-store-boundary` 已不在 list；Task 详情按当前 Application 快照推进  
- [x] 将结论记回 [brief.md](brief.md)「受影响范围」一行
