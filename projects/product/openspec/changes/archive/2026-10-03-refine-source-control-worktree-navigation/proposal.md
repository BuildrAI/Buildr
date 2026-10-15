## Why

源代码管理目前把代码库（Repository）筛选、工作树（Worktree）筛选与提交历史（Commit History）来源分别保存，选择上方来源后仍可能看到其他来源的内容；状态标签、重复主工作树（Main Worktree）行及隐藏的任务（Task）入口也增加了理解成本。用户已经明确提出本轮交互修复，需要让当前来源直接控制阅读内容，并把可核对的任务（Task）关联放在查看位置旁。

## What Changes

- 代码库（Repository）行即其主工作树（Main Worktree）选择，前方文件夹图标负责折叠关联工作树（Worktree）；代码库（Repository）目录区域头部也可以折叠，保留当前选择与阅读现场。
- 一个明确的代码库（Repository）及工作树（Worktree）选择统一控制未提交变更（Uncommitted Changes）和提交历史（Commit History），移除两种阅读模式中的重复来源和分支（Branch）筛选。相同名称不再形成来源聚合或任务（Task）关联。
- 每个来源右侧固定显示两组状态：上游（Upstream）提交（Commit）差异的上下箭头与数量，或未跟踪／未知标识；未提交文件数量，或独立的干净标识。未知与零保持不同语义。
- 来源名称与分支（Branch）同行展示，右侧远程、文件和任务（Task）列使用一致尺寸与固定对齐，远程跟踪和任务（Task）入口图标明显区分；完整路径改为可移入、选择和复制的悬停层（Hover Card），下方阅读区不重复代码库（Repository）及分支（Branch）来源栏。
- 主工作树（Main Worktree）与子来源共用图标、名称及分支（Branch）、远程、文件和任务（Task）的行内网格（Grid），全目录按已观察数字统一状态列宽；有未提交文件使用实心文件标识，无变更使用轮廓标识。任务（Task）图标统一提示“任务：标题”，目录信息层首行表达任务（Task），第二行统一表达代码库（Repository）及工作树（Worktree）身份。
- 右侧阅读标题保留紧凑来源，完整路径与当前分支（Branch）或固定提交（Commit）改为点击后在标题下方展开位置信息，支持复制及关闭；常规阅读不自动打开大块来源悬停层（Hover Card），不展示内部观察版本或重复任务（Task）标识。
- 提交历史（Commit History）保留关键词搜索，网页输入至少两个非空白字符时执行；列表仅展示标题、紧凑标识与时间，引用和任务（Task）通过图标及悬停摘要呈现。点击提交（Commit）选择右侧正式详情并展开或折叠变更文件，点击文件复用既有差异（Diff）及完整文件阅读；折叠同一提交（Commit）不清除已打开文件。
- 源代码管理选中可读取的 PNG、JPEG、GIF 或 WebP 图片时直接显示真实新旧图像，复用每侧8MiB上限和既有完整图片阅读。未跟踪、未暂存、已暂存及固定提交（Commit）按真实比较层确定来源，新建／删除明确缺侧，重命名读取真实旧路径；仅一侧存在时全宽显示新增图片或删除前图片，两侧存在时宽栏并排、窄栏上下，不以空文字差异（Diff）代替图片。
- 已核对工作树（Worktree）关联以直接任务（Task）入口呈现；不同代码库（Repository）的真实成员指向同一任务（Task），不凭名称猜测。提交（Commit）尾注关联显示准确任务（Task）名称，保留原任务（Task）阅读与返回行为。
- 悬停信息、列表及右侧正式详情采用一致的任务（Task）标识，详情展示完整字段、引用和说明正文且不重复标题，顶部与阅读区对齐，不保留空白占位。
- 删除工作台、工作空间及代码左侧菜单顶部重复区域名称，保留全局顶部区域选中状态及有意义的内部菜单分组。
- 不改变命令行接口（CLI）或网页接口（API）的参数结构；未指定分支（Branch）的历史读取会收窄为所选来源当前提交（Commit）的可达范围，这是有意的可观察行为变化。现有显式分支（Branch）查询及只读能力继续兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `code-source-control`：以真实单一工作树（Worktree）统一阅读范围、分组状态、搜索、提交（Commit）文件展开及可核对任务（Task）入口。
- `buildr-web-client`：同步源代码管理单一来源行为，并删除左侧菜单的重复区域名称，保留既有应用壳及页面状态。

## Impact

- 前端主要影响 `projects/product/services/buildr-web/src/features/code/` 的共享界面、来源状态与读取，以及 `src/app/AppNavigation.tsx`；继续复用 `TaskChangedFiles`、`TaskDiffContent`、`CommitInfoPopover`、可选择悬停层（SelectableHoverCard）、分隔组件（SplitDivider）和既有主题。图片阅读通过 `TaskDiffReader` 的可选正文插槽仅在源代码管理提供，默认文字和其他二进制行为保持。
- 后端主要影响 `projects/product/services/buildr/src/modules/code/` 的来源清单数据与已有工作树（Worktree）关联读取：返回明确的 `upstream`、`taskId`、`taskTitle`、`taskDiagnostic`，并保证选中来源的本机历史范围准确。图片差异（Diff）响应可选提供结构化新旧侧，复用 `readCodeFile` 与原路径、来源和版本校验；不新增完整文件读取的侧别协议。
- 复用已选择的任务（Task）工作树（Worktree）提供者（Provider）、当前任务（Task）查询及只读代码能力，不增加持久关联表、外部依赖、隐式抓取或 Git 写入。
- 现有浏览器检查须改为单一来源选择，补充主工作树（Main Worktree）、其他分支（Branch）、游离提交（Detached HEAD）、未知状态、跨库同一任务（Task）及返回现场的代表场景。
- 当前知识只核对直接相关职责，并按明确授权补既有服务与工程地图中的代码阅读及图片来源入口、维护原阅读关联；任务（Task）文字职责仍成立，不新增知识长文或技术图（Technical Diagram）。
