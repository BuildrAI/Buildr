## MODIFIED Requirements
### Requirement: 独立程序凭据与最小授权
系统 SHALL允许人在Buildr中创建、查看元信息、按已观察版本撤销程序凭据；明文仅创建返回一次，持久存储摘要，程序凭据 MUST不依赖网页会话。权限 SHALL区分读取、执行、问题回复和审批，限制登记工作空间，未显式公开操作 MUST拒绝。凭据 SHALL携带“允许全部授权执行”开关 `allowFullAccess`，默认开启，人 SHALL能在创建时选择并在凭据上按已观察版本切换；该开关 MUST不改变读取/执行/答复/审批的分权，也不自动提升任何请求的权限模式。
#### Scenario: 无凭据、撤销与越权
- **WHEN** 程序无有效凭据、使用已撤销凭据或访问未授权空间/操作
- **THEN** 系统 MUST拒绝相关调用且不产生执行副作用
#### Scenario: 网页安全边界保留
- **WHEN** 程序凭据请求网页管理或账号接口
- **THEN** 系统 MUST不将其视为网页会话
#### Scenario: 切换全部授权开关
- **WHEN** 人以已观察修订切换某凭据的 `allowFullAccess`
- **THEN** 系统 MUST按新版本保存该开关，后续 full-access 请求按新值门禁，原令牌与其余授权保持不变
### Requirement: 可发现的当前能力
系统 SHALL在固定HTTP路径返回认证调用方可访问的工作空间、Agent连接与模型、版本、就绪状态和能力及文档链接；MUST不暴露实例管理秘密和账号凭据。发现返回的连接 `capabilities.permissionModes` SHALL透传该连接真实支持的权限模式，支持全部授权的连接 MUST列出 `["default","full-access"]`，不得统一硬编码为 default。
#### Scenario: 无需浏览器发现
- **WHEN** 程序仅持有地址与Bearer凭据
- **THEN** 程序 MUST能读取发现并选择被授权的登记工作空间和连接
#### Scenario: 连接权限模式可见
- **WHEN** 程序读取发现且某连接执行器支持 full-access
- **THEN** 该连接 `capabilities.permissionModes` MUST包含 `full-access`，仅支持 default 的连接 MUST只列出 default
### Requirement: 可恢复的公共对话操作
系统 SHALL复用已有Application提供首发、发送、读消息、观察、问题回复与停止；写入 MUST保留版本及精确执行校验；重复同一请求 MUST不多启动工作，同标识不同输入 MUST冲突。程序请求 MUST不接受任意执行目录或越权任务关联。新建对话、发送与单步续聊 SHALL接受 `permissionMode=full-access`，行为与网页选择全部授权一致；省略时 MUST默认 default。当凭据 `allowFullAccess` 关闭时，请求 full-access MUST返回 403 且不产生执行副作用；连接不支持所选模式时 MUST按既有能力校验拒绝。
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
- **THEN** 系统 MUST按 full-access 受理并执行，不降级为 default，也不产生审批卡片等待
#### Scenario: 凭据关闭时拒绝提升
- **WHEN** 凭据 `allowFullAccess` 关闭，程序请求 `permissionMode=full-access`
- **THEN** 系统 MUST返回 403 且不启动工作