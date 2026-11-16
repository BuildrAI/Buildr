## MODIFIED Requirements

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
