## ADDED Requirements

### Requirement: 开发版 Harness 执行器环境必须直连已验证开发版 CLI 并保持安装边界
当 Harness 运行在 `development` 配置域且对应开发数据域存在有效或可核验的开发来源登记（在默认开发数据域上包括开发启动器回退登记）时，执行器存储 MUST 在自身私有工具链目录生成会话级 `buildr` 入口并前置到智能体子进程 `PATH`，且 MUST NOT 写入机器全局 `PATH`、修改全局 npm 安装或污染开发启动器自有目录；当 Harness 运行在 `released` 配置域或隔离开发数据域不存在任何开发来源登记时，MUST NOT 注入该会话入口。该会话入口 MUST 对归属开发版的工作空间与未登记目录直接使用已验证开发源码入口及绑定开发 Node 执行，不依赖全局 npm `buildr` 的存在或版本；对全局 npm 安装管理动作及独占归属 `released` 的工作空间，MUST 在子进程 `PATH` 中精确剥离会话入口自身目录后委派下游全局 `buildr` 以防止递归；对来源登记损坏、工作空间双边登记冲突或所需下游全局命令缺失时，MUST 非零退出并明确报错。

#### Scenario: 开发版会话脱离全局 npm 直连本机开发源码
- **WHEN** `development` 配置域且存在 `development-source.json` 的 Harness 拉起智能体执行器，即使下游 `PATH` 不存在全局 `buildr` 或全局 `buildr` 为旧版断裂实现
- **THEN** 会话内对开发版工作空间或未登记目录调用 `buildr` MUST 直接使用已验证开发源码及绑定开发 Node 执行
- **AND** MUST 保留参数、当前目录、标准流与退出状态且清理调用来源身份变量

#### Scenario: 开发版会话透明委派全局安装命令与发布版工作空间
- **WHEN** 同一开发版智能体会话执行 `buildr update`、`buildr installation status`、`buildr web launcher`、无 `--target` 的 `buildr web`，或针对独占归属 `released` 的工作空间执行命令
- **THEN** 会话入口 MUST 从下游 `PATH` 剥离自身私有目录后委派给机器真实全局 `buildr`
- **AND** 下游进程 MUST 不再再次命中共生会话垫片

#### Scenario: 发布版配置域与无登记隔离环境不注入开发垫片
- **WHEN** Harness 运行在 `released` 配置域，或运行在无 `development-source.json` 的隔离测试 `development` 数据目录（即使宿主机存在桌面开发启动器）
- **THEN** 执行器存储 MUST NOT 生成或向子进程 `PATH` 注入开发版会话 `buildr` 目录

#### Scenario: 来源损坏或工作空间冲突时失败关闭
- **WHEN** 开发版会话调用 `buildr` 时目标开发数据域存在损坏的 `development-source.json`，或目标工作空间同时登记在开发版与发布版
- **THEN** 会话入口 MUST 非零退出并报告具体诊断与下一步，MUST NOT 回退执行下游全局 `buildr`
