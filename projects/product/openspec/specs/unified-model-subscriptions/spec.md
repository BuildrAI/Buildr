# unified-model-subscriptions Specification

## Purpose
定义 Buildr 按本机应用配置域集中接入模型套餐的账号、动态模型目录、准确付费来源和协议互通，使不同原生智能体能够共享模型推理，同时保持工具执行、凭据、会话恢复和实际额度事实各自的边界。

## Requirements

### Requirement: 套餐账号与执行方独立

系统 MUST 允许 Codex、Qoder、DSH 独立选择已接入账号的模型，MUST 保留稳定账号来源、真实模型身份和观察版本；程序自身必需认证与模型套餐认证 MUST 分别表达。

#### Scenario: DSH 使用 Codex 套餐
- **WHEN** 用户选择 DSH 和已接入 Codex 账号的 GPT 模型
- **THEN** 推理由所选套餐提供，工具执行和权限仍由 DSH 原生负责
- **AND** MUST NOT 因未登录 DeepSeek 而统一拒绝此组合

### Requirement: Devin 登录与模型推理

系统 MUST 提供 Devin 浏览器登录、准确回调、动态模型发现与模型调用，MUST 保留工具回合、流式结果、取消和真实错误；MUST NOT 用 Devin 云端任务执行代替模型推理。

#### Scenario: 任一执行方使用 Devin
- **WHEN** 用户完成 Devin 登录并选择其可用模型
- **THEN** Codex、Qoder、DSH MUST 能通过对应兼容协议使用该模型
- **AND** 已输出的失败请求 MUST NOT 被静默换源重放

### Requirement: 私有凭据与本机路由

系统 MUST 按应用配置域隔离账号、密钥及本机网关，只允许已认证的准确模型绑定；上游秘密 MUST NOT 出现在公共响应、事件、日志或源资产。默认桌面账号 MUST NOT 被自动导入或覆盖。

#### Scenario: 访问另一套餐
- **WHEN** 客户端使用受限绑定请求未授权账号或模型
- **THEN** 网关 MUST 拒绝本次请求，不向上游发送

### Requirement: 目录和额度必须保留实际观察边界

系统 MUST 展示账号实际发现的模型、真实能力及额度更新时间；查询失败 MUST 保留可识别的旧观察，MUST NOT 将静态目录、估算用量或未知余额冒充已验证权益。某一账号查询失败 MUST NOT 阻断其他账号。

#### Scenario: 额度不可读取
- **WHEN** 模型可调用而套餐余额接口不可用
- **THEN** 系统 MUST 显示额度未知并保留模型使用能力，不制造零余额或已耗尽结论

### Requirement: 未知套餐输出路径必须如实表达

系统 MUST 区分执行方能消费外部模型和其个人套餐能供出模型。没有可靠输出接口时 MUST 明确该来源未接入，MUST NOT 伪造兼容或运行完整智能体循环冒充裸推理。

#### Scenario: Qoder 仅消费外部模型
- **WHEN** 已验证 Qoder 使用 Devin 而尚未证明 Qoder 个人套餐输出
- **THEN** 系统 MUST 分别报告这两项，不宣称全部双向互通
