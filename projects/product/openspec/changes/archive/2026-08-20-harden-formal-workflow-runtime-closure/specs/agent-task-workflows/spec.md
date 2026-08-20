## ADDED Requirements

### Requirement: 受管正式工作流必须通过 retained controller 调用内部入口
Buildr受管Skills与sidebars在调用Task Development、Task Retrospective或Task Planning Identity内部能力时 MUST使用matching Environment/Workspace解析出的retained controller invocation及其bundled `__internal` route。Consumer MUST NOT拼接当前checkout的`src/interfaces/internal/*.mjs`路径、用resource payload root代替controller identity或要求npm安装外存在development source root。

#### Scenario: 正式 Task 在隔离 worktree 中研发
- **WHEN** Agent在Task Environment candidate checkout中需要更新Development planning、读取Planning Identity或记录Retrospective
- **THEN** consumer MUST通过retained controller invocation进入对应Application
- **AND** candidate checkout中的source driver MUST NOT成为retained store writer authority

#### Scenario: npm Workspace 没有 controller source tree
- **WHEN** Workspace只安装正式npm artifact且Skill需要调用内部工作流能力
- **THEN** bundled route MUST从安装产物内完成分派
- **AND** consumer MUST NOT因`src/interfaces/internal`文件不存在而要求兼容调用或本地源码替代
