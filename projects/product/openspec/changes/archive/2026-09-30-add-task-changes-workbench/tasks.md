## 1. 后端只读读取与契约

- [x] 1.1 在 `services/buildr` 新增任务变更文件读取：按任务范围解析真实仓库与任务工作树，读取 `git status --porcelain=v2`（含未跟踪）、分支与领先远端计数；为每个文件产出差异预览（已修改/新增走 `git diff`，未跟踪走 `git diff --no-index` 取全文，已删除/纯重命名标注无预览），并按行数上限截断。
- [x] 1.2 按提交列文件：对每条关联提交读取 `git show` 的文件清单与差异片段；结果带读取时间、覆盖范围、完整性状态与局部诊断，局部仓库不可达时 `partial` 保留已读结果。
- [x] 1.3 在 `task-http-schema.ts` 新增 `changed-files` 请求/响应（`buildr.task-changed-files/v1`）与操作 `GET /tasks/:taskId/changed-files`；经 `contracts:generate` 更新 `task-dto.ts`、`task-professional-http-dto.ts` 与 CLI 输出。

## 2. 前端工作台

- [x] 2.1 新增 `useTaskChangedFiles` 与 `taskApi.changedFiles`；在 `TaskWorkPath` 注册内容标签「改动与提交」（带未提交文件计数），位于「任务收尾」之后、与提交前的阶段并列。
- [x] 2.2 落地 `TaskChangedFiles`（文件行/分组/状态标、可复制路径、读态/空白/失败/局部失败）与 `ChangedFileList`（`selectable`/`compact`/`onOpenDiff`），复用既有任务面板样式与图标。
- [x] 2.3 落地 `TaskDiffReader` 主从式工作台：左栏仓库树（更改+提交，提交可展开文件）、右栏差异面（统一/并排/全文）、行号与着色、未跟踪全文新增行、已删除/纯重命名说明；宽度自适应（<1000px 统一、≥1000px 并排、<560px 堆叠）与文件栏拖宽/收起。
- [x] 2.4 「展开全屏」：工作台内一键切换，阅读面脱离居中限宽，文件栏收成边侧条、悬停弹出浮窗；「恢复分屏」复原；该交互仅本标签生效，不改壳层通用行为。
- [x] 2.5 `TaskCommitRecords` 调整为按仓库分组并与工作台共用文件列表组件；`TaskDetailPage` 接入新标签与数据流，保持阶段标签与清单等既有行为不变。

## 3. 知识与文档

- [x] 3.1 按 `current-knowledge-maintenance` 更新受影响的当前知识（任务详情页组成与提交关联说明中涉及「改动与提交」入口与读取范围的描述）；已有 `.buildr/knowledge-impact.yml` 时同步维护。

## 4. 验证

- [x] 4.1 单元/集成测试：git 状态解析、diff 截断、未跟踪全文、按提交列文件、HTTP 契约形状；前端组件状态（分组、展开、视图切换、浮窗、自适应）。
- [x] 4.2 浏览器验证：真实任务页打开「改动与提交」，核对仓库分组、提交文件、差异三视图、文件栏拖宽/收起、全屏浮窗与恢复；窄宽两档检查。