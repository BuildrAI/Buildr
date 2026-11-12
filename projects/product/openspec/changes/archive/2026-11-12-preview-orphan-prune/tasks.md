# Tasks: preview-orphan-prune

## 1. 产品实现

- [x] 1.1 `preview-lifecycle.ts` 新增 `pruneOrphanPreviews`：文件存在 fail-closed 判定、processAlive 存活核对、复用 assertPurgeTargetSafe 删除、逐项结果与单目录失败隔离。
- [x] 1.2 `instance-lifecycle.ts` 增加 `prune` 分发；`interfaces/cli/web.ts` 增加命令帮助与 usage（start|list|stop|prune）。

## 2. 测试

- [x] 2.1 集成回归：孤儿目录（含宿主缓存链接与断链）删除且链接目标完好；有 owner 跳过；活进程跳过；记录无法解析跳过；单目录失败不扩大。
- [x] 2.2 CLI 帮助单元断言覆盖 prune 语义 token。

## 3. 当前认知与技能源

- [x] 3.1 `skills/buildr-dev-preview/SKILL.md` 交付与停止节明确验收后 stop --purge；`resources/workspace/skills/buildr/task-finish/SKILL.md` 收尾安全删除节加入任务预览清理与 prune 扫描。
- [x] 3.2 `knowledge/docs/architecture/buildr-data-design.md` 同步 prune 语义。

## 4. 直接验证

- [x] 4.1 聚焦 integration：prune 回归 + preview-reuse-lifecycle + preview-candidate-runtime。
- [x] 4.2 四服务全量门禁（npm run check）。