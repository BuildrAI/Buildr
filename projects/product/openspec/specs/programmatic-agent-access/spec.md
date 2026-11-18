# programmatic-agent-access Specification

## Purpose
为同机外部程序提供独立认证、按空间和操作授权的 Agent Service HTTP 入口，复用既有执行事实、幂等恢复和交互身份，令调用方无需浏览器认证即可安全委托并核验开发工作。

## Requirements

### Requirement: 独立程序凭据与最小授权

系统 SHALL 允许用户经任一获管理权的第一方页面创建、查看元信息及按已观察版本撤销程序凭据；明文仅创建返回一次，持久记录保留摘要和既有安全令牌文件语义，程序凭据 MUST 不依赖网页会话。Harness MUST 是程序凭据的唯一维护者，Development 仅调用管理接口，不再直接写同一凭据库。权限 SHALL 区分读取、执行、问题回复和审批，并限制明确的来源化执行范围；未显式公开操作 MUST 拒绝。目录范围 MUST 先由本机用户登记，程序不能凭路径自行扩大范围。

凭据 SHALL 保留“允许全部授权执行”开关 `allowFullAccess`，默认开启；人 SHALL 能在创建时选择并按凭据已观察修订切换。该开关 MUST 不改变读取/执行/答复/审批分权，不自动提升任何请求的权限模式；关闭时显式请求 full-access MUST 被拒绝且不产生执行副作用。原令牌、其他授权及既有省略权限模式的行为 MUST 保持：start/send 沿用原 default 规则，单步 `/messages` 沿用主规范“单步续聊”中继承最近轮次、无最近模式时 default 的规则；本变更 MUST NOT 将后者统一改成 default。

既有凭据 ID、摘要、令牌文件、撤销状态与回推关联 MUST 保留。旧 `workspaceIds` MUST 精确映射到原 Development 来源，不授予其他来源或模型账号管理权限。旧客户端更新 MUST 保留其无法表达的新范围，不能因省略字段删除未知授权项；明确撤销整个凭据仍按原语义生效。

#### Scenario: 无凭据、撤销与越权
- **WHEN** 程序无有效凭据、使用已撤销凭据或访问未授权范围/操作
- **THEN** 系统 MUST 拒绝相关调用且不产生执行副作用

#### Scenario: 网页安全边界保留
- **WHEN** 程序凭据请求网页管理、账号管理或共享后台生命周期接口
- **THEN** 系统 MUST 不将其视为页面会话或后台管理身份

#### Scenario: 切换全部授权开关
- **WHEN** 人以已观察修订切换某凭据的 `allowFullAccess`
- **THEN** 系统 MUST 按新版本保存开关，后续显式 full-access 请求按新值门禁，原令牌与其他授权保持

#### Scenario: 迁移后保留不同操作的省略语义
- **WHEN** 程序以同一有效凭据分别调用省略模式的 start/send 与最近一轮为 full-access 的 `/messages`
- **THEN** 前者 MUST 保持 default，后者 MUST 沿用最近轮次；显式 full-access 仍按主规范的凭据开关和连接能力校验

#### Scenario: 既有凭据在拆分后使用
- **WHEN** 已有本机程序沿旧工作空间 URL 和 Bearer 凭据调用
- **THEN** 其原范围和权限 MUST 保持，凭据转移维护者不要求重新签发或重新登录模型

#### Scenario: 旧客户端修改混合范围凭据
- **WHEN** 凭据已有其他来源范围，旧客户端仅修改可表达的 workspaceIds
- **THEN** 系统 MUST 版本化修改原 Development 子集并保留其他范围，显式整体撤销仍撤销该完整凭据

### Requirement: 可发现的当前能力

系统 SHALL 在固定 HTTP 发现入口返回认证调用方可访问的来源化执行范围、Agent 连接与模型、版本、就绪状态和能力及文档链接；MUST 不暴露实例管理秘密和账号凭据。目录范围 MUST 使用准确来源引用和有限展示信息，不能伪装为已登记业务工作空间。旧工作空间发现字段与 URL MUST 保留兼容投影，新来源须经新能力协商后使用。能力清单 SHALL 包含现有列表查询优化、单步续聊 messages、事件补查 events 与凭据回推配置操作，并按凭据权限过滤。

发现中的连接 `capabilities.permissionModes` MUST 透传真实支持的权限模式；支持全部授权的连接 MUST 列出 `default` 与 `full-access`，不能统一硬编码为 default。能力支持 MUST 不被当作调用者已经获得该权限。

#### Scenario: 无需浏览器发现
- **WHEN** 程序仅持有地址与 Bearer 凭据
- **THEN** 程序 MUST 能读取自己获准的范围及连接，发现清单反映当前可用的 messages、events 与回推配置操作

#### Scenario: 连接权限模式可见
- **WHEN** 程序读取发现且某连接支持 full-access
- **THEN** 该连接的 `capabilities.permissionModes` MUST 包含 full-access，仅支持 default 的连接 MUST 只列出 default

#### Scenario: 旧程序只理解工作空间
- **WHEN** 调用方使用原工作空间发现契约
- **THEN** 系统 MUST 只投影其获准的 Development 工作空间，不扩大到目录来源，不破坏原 URL

#### Scenario: 新程序选择目录范围
- **WHEN** 凭据明确获得已登记目录来源范围，且调用方协商了来源化能力
- **THEN** 发现 MUST 返回准确范围引用，执行 MUST 使用该引用核验，不接受任意 CWD 代替授权

### Requirement: 可恢复的公共对话操作
系统 SHALL复用已有Application提供首发、发送、读消息、观察、问题回复与停止；写入 MUST保留版本及精确执行校验；重复同一请求 MUST不多启动工作，同标识不同输入 MUST冲突。程序请求 MUST不接受任意执行目录或越权任务关联。新建对话、发送与单步续聊 SHALL接受 `permissionMode=full-access`，行为与网页选择全部授权一致；start/send 省略时 MUST 默认 default；单步 `/messages` 省略时 MUST 沿用最近一轮执行的 permissionMode，无最近模式时使用 default。当凭据 `allowFullAccess` 关闭时，请求 full-access MUST返回 403 且不产生执行副作用；连接不支持所选模式时 MUST按既有能力校验拒绝。
#### Scenario: 首发响应丢失
- **WHEN** 同一draftId和clientRequestId在断线后再次提交相同输入或查询
- **THEN** 系统 MUST复用原对话/执行，不新建工作
#### Scenario: 人机共同操作
- **WHEN** 用户已修改对话且程序携带旧版本写入
- **THEN** 系统 MUST显式拒绝陈旧写入并保留新内容
#### Scenario: 问题和审批分权
- **WHEN** 仅有问题回复权限的程序试图批准敏感操作
- **THEN** 系统 MUST拒绝且保留待审批卡片
#### Scenario: 凭据授权时全部受理
- **WHEN** 凭据 `allowFullAccess` 开启且连接支持 full-access，程序在 start/send/续聊传 `permissionMode=full-access`
- **THEN** 系统 MUST按 full-access 受理并执行，不降级为 default，不因入口差异降级权限；原生执行过程仍遵守实际执行器的授权与审批约定
#### Scenario: 凭据关闭时拒绝提升
- **WHEN** 凭据 `allowFullAccess` 关闭，程序请求 `permissionMode=full-access`
- **THEN** 系统 MUST返回 403 且不启动工作

### Requirement: 自描述与最小示例
系统 SHALL提供HTTP文档入口与OpenAPI，包含认证、参数、权限、副作用、错误、冲突、超时恢复、轮询和发任务/查状态/读结果的可运行示例；示例 MUST从本机文件读取令牌，不打印秘密。文档 SHALL 同步覆盖事件回推、列表查询优化与单步续聊，contractVersion MUST 随契约内容变化，并给出"配置回推→收到 decision.requested→读对话→单步续聊"的最小示例。

#### Scenario: 按文档调用
- **WHEN** 本机调用方按帮助配置地址和凭据文件
- **THEN** 调用方 MUST无需阅读源码或网页认证即可发起并观察工作，并 MUST 能按最小示例完成配置回推、接收 decision.requested、读对话与单步续聊

### Requirement: 列表查询优化
系统 SHALL 在 `GET /api/v1/programmatic/workspaces/{workspaceId}/conversations` 支持 `active=true`（仅返回活动中的对话：有待决请求、仍有执行中或未释放的工作，或产生尚未查看的新结果；已完成但未查看的对话属于 active）、`attention=true`（仅返回有待决请求、当前执行失败或状态 unknown 的对话；单纯已完成但未查看不属于 attention）、`fields=summary`（每个对话仅返回 id、title、runStatus、updatedAt、active、pendingDecisionCount）。返回 MUST 固定带 activityCounts；`activityCounts.active` MUST 等于同一工作空间范围内 `active=true` 的对话总数，`activityCounts.attention` MUST 等于同一范围内 `attention=true` 的对话总数；limit MUST 只限制返回页。

#### Scenario: 过滤与投影
- **WHEN** 程序携带 active=true 或 attention=true 或 fields=summary 查询列表
- **THEN** 系统 MUST 按参数过滤或投影，固定返回 activityCounts，且 limit 只限制返回页
- **AND** activityCounts.active MUST 与 active=true 的总数一致，activityCounts.attention MUST 与 attention=true 的总数一致
- **AND** 已完成但未查看的对话 MUST 计入 active，MUST NOT 计入 attention

### Requirement: 单步续聊
系统 SHALL 提供 `POST /api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}/messages`（execute 权限），请求体 text（必填）、clientRequestId（必填）、expectedRevision（可选）、permissionMode（可选，default 或 full-access）。服务端 MUST 内部完成 prepare-send 和 send，沿用对话原连接和模型，返回 202 和 runId。省略 permissionMode 时 MUST 沿用该对话最近一轮执行的 permissionMode；没有最近轮次时 MUST 使用 default。显式 full-access MUST 与 send 使用同一凭据 allowFullAccess 门禁，关闭时 MUST 返回 403 programmatic_forbidden。幂等规则 MUST 与现有 send 相同；对话正在运行或修订不一致 MUST 返回 409。

#### Scenario: 单步续聊成功
- **WHEN** 程序对空闲对话提交合法 text 与 clientRequestId
- **THEN** 系统 MUST 内部完成 prepare-send+send，沿用原连接与模型，返回 202 与 runId

#### Scenario: 幂等与冲突
- **WHEN** 同一 clientRequestId 重试，或对话正在运行，或 expectedRevision 不一致
- **THEN** 相同输入重试 MUST 复用原执行不新建工作；运行中或修订不一致 MUST 返回 409

#### Scenario: 权限模式继承与门禁
- **WHEN** 对话最近一轮为 full-access，程序省略 permissionMode 提交 messages
- **THEN** 新执行 MUST 继续使用 full-access
- **AND** 显式请求 full-access 且凭据关闭 allowFullAccess 时 MUST 返回 403 programmatic_forbidden

### Requirement: 凭据回推配置管理
系统 SHALL 允许经宿主认证在每个程序接入凭据下读取、版本化保存回推设置（接收地址、启用开关、速率限制），主动查看密钥与发送测试通知，并读取最近投递记录。普通配置读取 MUST 不返回密钥；密钥仅存本机私有文件，界面默认隐藏、日志不输出明文。保存 MUST 校验已观察修订，空密钥输入保留原值，首次启用缺少密钥拒绝。

#### Scenario: 配置与停用
- **WHEN** 用户保存有效地址与密钥或停用某凭据回推
- **THEN** 系统 MUST 安全保存私有配置且无需重启生效，停用保留配置但停止新发送；空密钥保留原值，首次启用缺密钥拒绝

#### Scenario: 密钥查看与测试
- **WHEN** 用户经会话认证与当前修订校验点击查看密钥或测试
- **THEN** 独立请求才返回明文且禁缓存；测试发送独立标注 test 的无业务内容请求，禁重定向、5 秒超时、不重试，界面显示最近结果，不暴露响应正文或密钥

### Requirement: 最终回复轻量读取
系统 SHALL 提供 `GET /api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}/runs/{runId}/final-reply`（read 权限及路径工作空间授权）。响应 MUST 只包含 `runId` 与该 run 最后一条可见 assistant 回复的完整 `finalReply`，MUST NOT 返回完整对话。run 不存在且没有该 run 的消息记录时 MUST 返回 404 agent_run_missing。

#### Scenario: 读取终态回复
- **WHEN** 接收方收到带 finalReplyUrl 的终态事件并 GET 该地址
- **THEN** 系统 MUST 返回 {runId,finalReply}，正文不截断，不附带完整对话

#### Scenario: 未知执行
- **WHEN** runId 不属于该对话且没有对应消息
- **THEN** 系统 MUST 返回 404 agent_run_missing

### Requirement: 回推权限说明
程序文档 MUST 说明当前凭据的实际权限以发现入口返回的 `credential.scopes` 和各 capability 的 scope 为准，MUST NOT 用产品名或示例推断固定权限。每条回推 payload MUST 携带事件生成时当前凭据的 `scopes` 与 `allowFullAccess`。

#### Scenario: 权限快照
- **WHEN** 宿主为凭据产生回推事件
- **THEN** payload MUST 含最近一次观察的 scopes 与 allowFullAccess
