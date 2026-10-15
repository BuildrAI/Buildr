# Buildr 安装互斥

[任务说明](@task/dsh-plugin-exclusive-install)

给 DSH 原安装器补充 Buildr 专属互斥检查，已有任一 Buildr 插件时先提示卸载并拒绝新安装。仅入口加载失败或编译 SDK 不构成安装前拒绝；拒绝不自动切换，完整运行时（Runtime）的采用与源码验证分别核对。

方案和兼容边界见 [design.md](design.md)，具体承诺见 [安装分发规范](specs/dsh-plugin-distribution/spec.md)。当前知识影响限于插件安装说明和既有双入口装载验证的范围说明；业务观察模型及其图示无需修改。
