## Context

Task Record 已有可编辑的纯文本 `intent`，Buildr Web 已有受限 Markdown renderer，以及 Project Application 提供的 Project 根内 `.md` 文档只读接口。当前缺口只是 Task 详情没有把这三项能力连接起来；为此新增附件表或文档状态会扩大 Task Record 和生命周期边界。

## Goals / Non-Goals

**Goals:**

- 让普通用户在 Task Intent 中看到有意义的文档名称，并点击打开只读预览。
- 使用 Workspace 相对路径描述引用，保持文本可读、可复制。
- 复用 Project 文档读取的路径边界、Markdown 展示和相对文档导航。

**Non-Goals:**

- 不新增 Task 附件表、引用 identity、current/stale 状态或 Planning gate。
- 不提供任意文件下载、编辑、上传或 Workspace 全盘扫描。
- 不改变 Task Record schema、CLI 或 Intent 的 writer authority。

## Decisions

### Intent 使用普通 Markdown 链接

Task 仍只保存现有 `intent` 字符串。用户或 Agent 可以用链接名称 `Buildr Service Architecture` 和以下 Workspace 相对目标组成普通 Markdown 链接：

`projects/product/docs/architecture/service-architecture.md`

Task 详情使用现有受限 Markdown renderer 展示 Intent。相比新建附件模型，这一方式保留当前 writer、编辑入口和搜索行为，也满足名称、路径与点击查看的基本需求。

### Workspace 相对路径只解析到已登记 Project

客户端读取 Project registry，使用 Project 的真实 `source.path` 匹配链接路径；匹配后只把 Project 相对 `.md` 路径交给现有 Project Document API。不得按 `projects/<code>` 目录约定猜测 Project，也不得把任意绝对路径交给 HTTP 接口。

### 使用 Task 内只读文档预览

点击合法引用后打开只读 Modal，显示文档名称和 Project 相对路径，并使用 `MarkdownHost` 展示正文。文档中的相对 `.md` 链接继续限定在同一 Project 内；缺失、非 Markdown、越界或不属于 Task scope 的引用显示明确错误。

相比跳转到 Project 详情，Modal 保留用户正在查看的 Task 上下文，也不需要引入新的深链路由。

## Risks / Trade-offs

- [Intent 仍是自由文本，无法单独查询附件] → 第一版只满足用户查看需求；不建立第二套引用 authority。
- [Project source path 变化会使旧链接失效] → 点击时基于 current registry 解析并显示明确不可用提示，不自动改写 Intent。
- [Markdown 可能被误认为支持任意本地链接] → 仅 Project scope 内 `.md` 路径进入预览，其余相对链接不执行文件读取。
