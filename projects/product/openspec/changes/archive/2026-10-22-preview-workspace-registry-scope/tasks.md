## 1. 登记入口临时根拦截

- [x] 1.1 在 `workspace-registry-repository.ts` 暴露共享登记文件解析与隔离判定（`sharedRegistryFile`、`isSharedRegistryScope`）
- [x] 1.2 在 `workspace-command-application.ts` 的 `registerLocalWorkspace` 中，仅当写入共享 Profile 登记列表时拒绝系统临时目录、`/tmp`（含符号链接）与 `.worktrees/` 检出路径，返回明确错误码
- [x] 1.3 `removeRegisteredWorkspace` 对仅存在于共享列表的目标返回明确诊断

## 2. 预览登记合并

- [x] 2.1 registry repository 在 `BUILDR_LOCAL_APP_PREVIEW` + 隔离数据根时自动推导共享登记文件路径（`resolvePreviewSharedRegistryFile`），无需 module.ts 显式接线
- [x] 2.2 `workspace-query-application.ts` 的 `listRegisteredWorkspaces`/`resolveRegisteredWorkspace` 合并共享 roots 并标注 `registryScope`
- [x] 2.3 `registerLocalWorkspace` 的 identity 冲突检查覆盖合并集合

## 3. 验证

- [x] 3.1 补单元/契约测试：共享登记拒绝临时根、预览合并可见、预览移除共享条目的诊断、隔离数据根不受影响
- [x] 3.2 跑受影响测试文件确认通过
