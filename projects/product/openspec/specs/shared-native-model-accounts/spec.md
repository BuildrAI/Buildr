# shared-native-model-accounts Specification

## Purpose
定义Buildr复用原生账号登录并自动发现共享模型的行为，使Codex、DSH、Qoder使用准确套餐来源，保持凭据续期、账号身份和工具执行边界。

## Requirements

### Requirement: 登录一次并自动发现模型

系统 MUST 复用Buildr原生Codex、DSH、Qoder账号登录，自动发现共享模型，不要求第二次套餐登录；MUST 由原生账号负责续期，不复制刷新凭据。账号状态因凭据续期或临时未认证而短暂降级时，系统 MUST NOT 中止进行中的模型请求，也 MUST NOT 撤销这些请求正在使用的租约；这些租约 MUST 随其所属执行来源结束而撤销，新一轮执行 MUST 按当前账号状态重新核验。账号身份变化或账号断开时，旧来源和租约 MUST 立即失效。由模型设置删除 linked 共享原生账号时，系统 MUST 清理该账号的唯一登录来源并使对应智能体连接显示未登录，MUST NOT 保留一份可继续使用的旧凭据；删除后 MUST 抑制自动重建，直到用户再次明确接入。

#### Scenario: 已登录账号
- **WHEN** 用户已有原生账号登录并打开账号设置
- **THEN** 自动发现该账号可用模型，无需另建套餐或再次登录

#### Scenario: 断开或更换账号
- **WHEN** 原生账号断开或身份改变
- **THEN** 旧来源和租约不得继续消费或静默换用新账号

#### Scenario: 凭据续期期间执行仍在进行
- **WHEN** 原生账号在凭据续期过程中短暂报告未认证，而一轮执行正在请求模型
- **THEN** 在途请求 MUST 继续完成，其租约 MUST 保留到所属执行来源结束
- **AND** 新一轮执行 MUST 按当前账号状态重新核验，不静默换用其他来源

#### Scenario: 删除共享原生登录
- **WHEN** 用户确认删除 linked 共享原生账号
- **THEN** 系统 MUST 清理其唯一登录来源并撤销该账号租约
- **AND** 对应智能体连接 MUST 显示未登录，且后台核对 MUST NOT 自动重建空账号

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
