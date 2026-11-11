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
系统 SHALL在固定HTTP路径返回认证调用方可访问的工作空间、Agent连接与模型、版本、就绪状态和能力及文档链接；MUST不暴露实例管理秘密和账号凭据。
#### Scenario: 无需浏览器发现
- **WHEN** 程序仅持有地址与Bearer凭据
- **THEN** 程序 MUST能读取发现并选择被授权的登记工作空间和连接

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
系统 SHALL提供HTTP文档入口与OpenAPI，包含认证、参数、权限、副作用、错误、冲突、超时恢复、轮询和发任务/查状态/读结果的可运行示例；示例 MUST从本机文件读取令牌，不打印秘密。
#### Scenario: 按文档调用
- **WHEN** 本机调用方按帮助配置地址和凭据文件
- **THEN** 调用方 MUST无需阅读源码或网页认证即可发起并观察工作
