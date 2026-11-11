# programmatic-agent-access Specification

## Purpose
为同机外部程序提供独立认证、按空间和操作授权的 Agent Service HTTP 入口，复用既有执行事实、幂等恢复和交互身份，令调用方无需浏览器认证即可安全委托并核验开发工作。

## Requirements

### Requirement: 独立程序凭据与最小授权
系统 SHALL允许人在Buildr中创建、查看元信息、按已观察版本撤销程序凭据；明文仅创建返回一次，持久存储摘要，程序凭据 MUST不依赖网页会话。权限 SHALL区分读取、执行、问题回复和审批，限制登记工作空间，未显式公开操作 MUST拒绝。
#### Scenario: 无凭据、撤销与越权
- **WHEN** 程序无有效凭据、使用已撤销凭据或访问未授权空间/操作
- **THEN** 系统 MUST拒绝相关调用且不产生执行副作用
#### Scenario: 网页安全边界保留
- **WHEN** 程序凭据请求网页管理或账号接口
- **THEN** 系统 MUST不将其视为网页会话

### Requirement: 可发现的当前能力
系统 SHALL在固定HTTP路径返回认证调用方可访问的工作空间、Agent连接与模型、版本、就绪状态和能力及文档链接；MUST不暴露实例管理秘密和账号凭据。能力清单 SHALL 包含列表查询优化参数、单步续聊 messages、事件补查 events 与凭据回推配置管理操作，并按凭据权限过滤。

#### Scenario: 无需浏览器发现
- **WHEN** 程序仅持有地址与Bearer凭据
- **THEN** 程序 MUST能读取发现并选择被授权的登记工作空间和连接，能力清单 MUST 反映新增的 messages、events 与回推配置操作

### Requirement: 可恢复的公共对话操作
系统 SHALL复用已有Application提供首发、发送、读消息、观察、问题回复与停止；写入 MUST保留版本及精确执行校验；重复同一请求 MUST不多启动工作，同标识不同输入 MUST冲突。程序请求 MUST不接受任意执行目录或绕过授权的full-access。
#### Scenario: 首发响应丢失
- **WHEN** 同一draftId和clientRequestId在断线后再次提交相同输入或查询
- **THEN** 系统 MUST复用原对话/执行，不新建工作
#### Scenario: 人机共同操作
- **WHEN** 用户已修改对话且程序携带旧版本写入
- **THEN** 系统 MUST显式拒绝陈旧写入并保留新内容
#### Scenario: 问题和审批分权
- **WHEN** 仅有问题回复权限的程序试图批准敏感操作
- **THEN** 系统 MUST拒绝且保留待审批卡片

### Requirement: 自描述与最小示例
系统 SHALL提供HTTP文档入口与OpenAPI，包含认证、参数、权限、副作用、错误、冲突、超时恢复、轮询和发任务/查状态/读结果的可运行示例；示例 MUST从本机文件读取令牌，不打印秘密。文档 SHALL 同步覆盖事件回推、列表查询优化与单步续聊，contractVersion MUST 随契约内容变化，并给出"配置回推→收到 decision.requested→读对话→单步续聊"的最小示例。

#### Scenario: 按文档调用
- **WHEN** 本机调用方按帮助配置地址和凭据文件
- **THEN** 调用方 MUST无需阅读源码或网页认证即可发起并观察工作，并 MUST 能按最小示例完成配置回推、接收 decision.requested、读对话与单步续聊

### Requirement: 列表查询优化
系统 SHALL 在 `GET /api/v1/programmatic/workspaces/{workspaceId}/conversations` 支持 `active=true`（仅返回 activity.active 为 true 的对话）、`attention=true`（仅返回有待决请求、失败或卡住的对话）、`fields=summary`（每个对话仅返回 id、title、runStatus、updatedAt、active、pendingDecisionCount）。返回 MUST 固定带 activityCounts，limit MUST 生效。

#### Scenario: 过滤与投影
- **WHEN** 程序携带 active=true 或 attention=true 或 fields=summary 查询列表
- **THEN** 系统 MUST 按参数过滤或投影，固定返回 activityCounts，且 limit 生效

### Requirement: 单步续聊
系统 SHALL 提供 `POST /api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}/messages`（execute 权限），请求体 text（必填）、clientRequestId（必填）、expectedRevision（可选）。服务端 MUST 内部完成 prepare-send 和 send，沿用对话原连接和模型，返回 202 和 runId。幂等规则 MUST 与现有 send 相同；对话正在运行或修订不一致 MUST 返回 409。

#### Scenario: 单步续聊成功
- **WHEN** 程序对空闲对话提交合法 text 与 clientRequestId
- **THEN** 系统 MUST 内部完成 prepare-send+send，沿用原连接与模型，返回 202 与 runId

#### Scenario: 幂等与冲突
- **WHEN** 同一 clientRequestId 重试，或对话正在运行，或 expectedRevision 不一致
- **THEN** 相同输入重试 MUST 复用原执行不新建工作；运行中或修订不一致 MUST 返回 409

### Requirement: 凭据回推配置管理
系统 SHALL 允许经宿主认证在每个程序接入凭据下读取、版本化保存回推设置（接收地址、启用开关、速率限制），主动查看密钥与发送测试通知，并读取最近投递记录。普通配置读取 MUST 不返回密钥；密钥仅存本机私有文件，界面默认隐藏、日志不输出明文。保存 MUST 校验已观察修订，空密钥输入保留原值，首次启用缺少密钥拒绝。

#### Scenario: 配置与停用
- **WHEN** 用户保存有效地址与密钥或停用某凭据回推
- **THEN** 系统 MUST 安全保存私有配置且无需重启生效，停用保留配置但停止新发送；空密钥保留原值，首次启用缺密钥拒绝

#### Scenario: 密钥查看与测试
- **WHEN** 用户经会话认证与当前修订校验点击查看密钥或测试
- **THEN** 独立请求才返回明文且禁缓存；测试发送独立标注 test 的无业务内容请求，禁重定向、5 秒超时、不重试，界面显示最近结果，不暴露响应正文或密钥
