## Context
现有ProgrammaticCredentials仅将摘要和元信息存SQLite，创建返回一次性token。程序文档已经共用生成器，但只在Bearer路由提供。前端API客户端只解析JSON且可显式启用网页会话。

## Goals / Non-Goals
**Goals:** 已登录人可随时读文档；创建一次即可让同机程序通过文件使用；旧凭据可显式换新。
**Non-Goals:** 不放开匿名文档、不让程序管理凭据、不读取旧聊天令牌、不存浏览器localStorage、不支持任意写入路径或远程桥接，不改变Agent开发授权。

## Decisions
- 在app/programmatic-access/documents下提供网页会话认证的JSON文档封装，复用help/OpenAPI生成器；配置页抽屉渲染Markdown或JSON，可下载，不使用URL查询令牌。
- 每次新建/重新生成，宿主在dataRoot/programmatic-access/tokens下以随机凭据ID及修订命名创建600普通文件；目录700。固定宿主路径避免文件写入API被用于任意路径覆盖。数据库仍仅存摘要、路径和元信息。
- 写入文件成功后才提交凭据事务；保存失败/版本冲突不生效，清理本次新文件。exclusive/no-follow创建，拒绝符号链接、硬链接和非普通对象；不覆写已有文件。
- 重新生成保留凭据ID及授权，以expectedRevision并发校验；仅有效凭据可换新，旧令牌随摘要更新立即失效。旧已失效文件保留，不扩大为文件删除操作。
- 创建响应保留token以兼容原管理员脚本，界面只消费credential/tokenFilePath。列表和接入信息不包含秘密。
- 折叠区文本包含名称、API、文件路径、空间、权限和文档URL，要求通过文件认证并自行读取文档，无逐步开发教程。旧凭据没有文件路径时不给出可用假象，提示重新生成。

- 文档从同一操作登记和Schema生成，完整OpenAPI将重复的非平凡JSON Schema提为components.schemas引用；去掉嵌入Schema的$id/$schema，避免相对引用基址歧义。单操作描述只携带选中操作及其传递依赖模型，不依赖再下载完整OpenAPI。
- GET /operations提供轻量目录，GET /operations/{operationId}提供自包含OpenAPI片段；管理侧文档入口用同一来源包装。contractVersion由实际完整契约内容摘要派生，和产品version分开，便于调用方缓存失效判断，不缓存实时工作空间/执行事实。操作目录不包含模型目录和实例秘密。

## Risks / Trade-offs
明文令牌新增到本机文件是用户要求的可用性选择；700/600和实例隔离限制同机访问，但不对同一系统用户或Agent工具形成沙箱。目录不安全、权限设置或磁盘失败必须显式报错，不能回退到手工复制并称成功。跨文件/SQLite崩溃可能留下孤立无效令牌文件，不会产生额外有效凭据；恢复原工作不重发。网页入口依赖原会话与Host/Origin保护，Bearer不得访问管理文档。
