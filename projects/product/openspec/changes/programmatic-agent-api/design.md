## Context
现有 agent-service HTTP contribution 已覆盖对话操作并从 Schema 生成校验；宿主拥有网页认证和登记工作空间解析。外部调用者为本机 shell/curl，轮询即可，问题和审批交给人。
## Goals / Non-Goals
Goals: 专用凭据、最小权限、独立发现与文档、可恢复和去重提交。
Non-Goals: CLI全集、MCP/ACP、云桥接、GrokBot插件和真实开发验收。
## Decisions
- 在 agent-service 中增加程序接入应用与凭据存储；新 HTTP 前缀只开放显式操作表，委托原 contribution。避免复制对话业务，不让 Bearer 进入任意网页管理接口。
- 凭据使用密码学随机值、只保存摘要及元信息，SQLite事务保存并以修订撤销；创建仅返回一次明文。按 dataRoot 隔离并设置私有文件权限，拒绝符号链接。浏览器会话保持原样。
- 操作权限分 read/execute/answer/approve；read包含观察，execute不允许借权限模式提升获得full-access。reply先检查准确待处理卡片类型再授权。GrokBot仅read/execute，用户本人从Web回答。
- 使用稳定 draftId + clientRequestId 的已有 startDraft/lookupDraft实现首发去重与超时确认；后续send复用已有去重。只在已登记工作空间执行，不接受任意cwd。
- 新公共路径映射原Schema，OpenAPI与运行分派共用操作表；中文Markdown说明副作用、恢复与状态，不要求事件流。
- 在现有设置里局部扩展凭据列表、权限/工作空间选择与一次展示，无新导航体系。凭据不放URL、本地存储或日志。
- 用户不授权Git提交，因此只以任务预览运行候选，不调用要求已交付提交的自举激活执行器；凭据绑定该预览，联调服务保留。
## Risks / Trade-offs
- 工作空间授权并非操作系统沙箱：Agent工具权限仍沿用本机接入和权限模式；文档明确其不是文件系统强隔离。
- 预览重启可能换端口：固定发现路径、设置显示地址；失联先更新地址后查询原标识，不重发。
- 接口文档漂移：共用操作定义及Schema，自动断言路径和权限。
## Migration Plan
新增独立私有凭据库，无旧数据迁移。旧网页入口不变；撤销凭据或停止候选服务可关闭新入口，不回滚对话成果。
