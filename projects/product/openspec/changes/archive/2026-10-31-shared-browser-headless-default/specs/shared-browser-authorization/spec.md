## ADDED Requirements

### Requirement: 默认后台授权并显式选择本人交互
声明共享浏览器的授权 MUST 默认使用无头运行（Headless）；仅当调用者明确提供 browserMode=interactive 时 SHALL 启动可见模式。私有授权上下文 MUST 提供实际模式，未声明共享资源的既有授权 MUST 保持原行为。无头授权不能完成时专业方法 SHALL 明确返回需要交互的诊断，MUST NOT 隐式清空登录配置或重开可见窗口。
#### Scenario: 默认续期
- **WHEN** 连接声明共享资源且调用者未提供模式
- **THEN** 浏览器 SHALL 使用 headless，授权方法取得该模式并尝试复用已有登录基础
#### Scenario: 显式本人交互
- **WHEN** 调用者提供 interactive 且没有其他模式占用
- **THEN** 系统 SHALL 使用同一持久配置启动可见浏览器，仍仅交付本次页面控制权
#### Scenario: 模式冲突
- **WHEN** 同一配置的活动实例与请求模式不同，或旧实例的模式不能确认
- **THEN** 系统 MUST 拒绝本次获取并报告模式不符，MUST NOT 重启实例或打断原使用方
#### Scenario: 非法模式
- **WHEN** 授权输入提供未知模式
- **THEN** 系统 MUST 在启动浏览器或授权程序前拒绝输入
