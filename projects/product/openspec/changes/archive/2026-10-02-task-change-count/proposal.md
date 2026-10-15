## Why

任务详情为了一个文件数读取提交历史和差异预览，首次数量显示偏慢；说明也应直接使用现有主内容区。现在增加最小只读计数，保留现有完整读取接口，属于兼容新增。

## What Changes

- 提供 `GET /tasks/:taskId/changed-file-count`，只读取任务范围内的工作区文件状态。
- 详情打开时读取数量，进入改动标签时读取完整列表；刷新重新核对两种读取。
- 说明直接展示正文，复用其他标签的主内容区。
- 选中文件后定位第一处内容差异，上下对比采用单列行号。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-changes-workbench`: 数量独立快速读取，详情打开无需提交和差异扫描。

## Impact

影响任务只读应用、HTTP 数据契约、读取工作进程及前端任务页面。没有存储迁移、Git 写入或新依赖。
