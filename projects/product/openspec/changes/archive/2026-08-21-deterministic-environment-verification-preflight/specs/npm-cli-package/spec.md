## ADDED Requirements

### Requirement: npm发行版运行时不得依赖development准备事实
npm安装的Buildr CLI、Launcher与`buildr web`其产品启动、package entry和Web静态负载 MUST只消费已安装package、安装回执、兼容Host Node及随包`web-dist`，并 MUST NOT读取Product源码`preparation.yml`、development Environment Receipt、源码`node_modules`、源码TypeScript或要求用户设置`BUILDR_NODE`。Workspace命令 MAY且在其既有契约要求时 MUST读取目标用户Workspace的Rules、Project declarations、runtime projection与其他权威资产；这些目标Workspace输入 MUST NOT被误判为Product development依赖。

#### Scenario: 用户在普通Workspace运行发行版CLI
- **WHEN** 用户通过npm installation执行`buildr doctor`、`sync`、`update`或其他发行版命令
- **THEN** CLI MUST从安装回执与package entry使用兼容Host Node启动
- **AND** MUST不查找Product checkout的精确development Node或源码依赖，但doctor与sync仍 MUST按各自契约读取目标Workspace authority

#### Scenario: 用户运行发行版Buildr Web
- **WHEN** 用户执行npm installation的`buildr web`或已验证Launcher binding
- **THEN** runtime MUST托管该package携带的`web-dist`
- **AND** MUST不安装Buildr Web源码依赖、运行源码TypeScript/Vite或读取Task preparation closure

#### Scenario: 发行资产泄漏源码依赖
- **WHEN** npm tarball或Launcher smoke发现入口需要`BUILDR_NODE`、Product checkout、源码`node_modules`或源码TypeScript
- **THEN** Candidate或发布验证 MUST将其判为发行缺陷并失败
- **AND** MUST不把设置环境变量或安装源码依赖作为用户恢复动作
