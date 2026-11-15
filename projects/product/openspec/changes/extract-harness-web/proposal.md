## Why

组件级共享把工程宿主接口和对话实现耦合在一起，功能归属及发行对象难以解释。用户已明确采用下层 Harness 完整产品、上层 Development 准备工程现场的边界；本修订替代此前的共享 UI 包与宿主注入方案，保留已经验证的执行和数据兼容行为。

## What Changes

- 原 buildr-agent 改名 buildr-harness，合并独立 CLI、启动器和发行装配，保留数据目录与执行身份兼容。
- buildr-harness-web 拥有完整唯一对话网页；独立 buildr-harness-ui 包删除，代码与测试迁入网页服务。
- Development 的 buildr-web/features/harness-ui 仅拥有工程集成：工作空间选择、嵌套网页、对话任务关联、工程上下文交接及导航。
- Development 通过同源受认证路径托管同一 Harness 静态产物，以 iframe 嵌入；不复制对话状态和执行控制，不新增常驻宿主。
- 页面通信核对准确 origin、窗口和协议；只保留具名动作。执行交接的受理与未知结果由 Harness 负责，Development 不重放。

## Capabilities

### New Capabilities
- `harness-web-composition`: 完整网页的独立和嵌入承载、认证、有限页面通信与模式保持。

### Modified Capabilities
- `buildr-web-service`: Development 工程集成模块不消费 Harness React 组件。

## Impact

影响核心包名、服务组成、两产品构建与验包、网页集成、相关测试及架构说明；不改变用户账号与历史的数据根，不公开发布，不扩展 Windows 实测或新增 DSH 插件发行物。三种未来 DSH 插件组合应能按产品边界选择，不构成当前新增实现目标。
