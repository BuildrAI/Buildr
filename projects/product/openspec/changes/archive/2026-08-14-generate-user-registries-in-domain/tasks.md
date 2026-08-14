## 1. 发布边界

- [x] 1.1 在 package static validation 中定义并拒绝用户态 Workspace/Project 配置源及其 mapping
- [x] 1.2 从 package manifest、target 目录和模板变量中移除用户态配置物理源

## 2. Domain writer 生成

- [x] 2.1 让 `init` 通过 canonical writer 生成 Workspace metadata 和 Workspace 级 registries，再从 package 声明收敛 Builtins/Components
- [x] 2.2 让 Project 创建与同步通过 canonical writer 生成缺失的 `capabilities.yml`、`commands.yml` 和 Service registry，并保留已有用户内容
- [x] 2.3 删除已失效的 Workspace/Service mapping 跳过逻辑，确保配置默认值只有一个代码 authority

## 3. 契约与验证

- [x] 3.1 增加 checkout 初始化、Project 创建、同步补缺与已有配置保留测试
- [x] 3.2 增加 Application Payload/npm tarball 禁止用户态配置源的 inventory 测试
- [x] 3.3 更新受影响的 Buildr 当前认知并记录 knowledge impact evidence
- [x] 3.4 运行 OpenSpec strict validation、package/release affected 验证并修复发现
