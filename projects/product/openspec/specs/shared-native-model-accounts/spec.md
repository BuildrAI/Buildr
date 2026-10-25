# shared-native-model-accounts Specification

## Purpose
定义Buildr复用原生账号登录并自动发现共享模型的行为，使Codex、DSH、Qoder使用准确套餐来源，保持凭据续期、账号身份和工具执行边界。

## Requirements

### Requirement: 登录一次并自动发现模型
系统 MUST 复用Buildr原生Codex、DSH、Qoder账号登录，自动发现共享模型，不要求第二次套餐登录；MUST 由原生账号负责续期，不复制刷新凭据。

#### Scenario: 已登录账号
- **WHEN** 用户已有原生账号登录并打开账号设置
- **THEN** 自动发现该账号可用模型，无需另建套餐或再次登录

#### Scenario: 断开或更换账号
- **WHEN** 原生账号断开或身份改变
- **THEN** 旧来源和租约不得继续消费或静默换用新账号

### Requirement: Qoder套餐跨执行方消费
系统 MUST 支持Codex、DSH使用已登录Qoder账号的套餐模型，保留原生工具调用与结果、多轮、流式错误和取消；MUST NOT 由Qoder执行调用方的工具或通过提示词模拟工具协议。

#### Scenario: DSH使用Qoder模型
- **WHEN** 用户选择DSH与已登录Qoder账号的可用模型
- **THEN** 推理由Qoder套餐提供，工具在DSH执行并返回模型下一轮请求

### Requirement: 保留既有账号
系统 MUST 保留旧独立套餐及会话绑定，主要界面只展示每个原生账号的单一登录入口，额外账号按需展开。

#### Scenario: 升级已有套餐
- **WHEN** 用户更新到复用原生登录的版本
- **THEN** 原套餐与会话保留，未登录的重复占位不占据主要界面
