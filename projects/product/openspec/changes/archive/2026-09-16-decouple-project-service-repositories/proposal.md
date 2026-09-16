## Why

当前服务（Service）同时表达业务能力、项目（Project）归属和代码位置，无法准确表示多个业务共享同一代码库实例（Repository Instance）。项目主页缺少关系维护入口，列表、主页与编辑入口也不一致；用户已确认模型和可操作原型，并授权开始正式任务。

## What Changes

- **BREAKING**：项目与服务多对多，每个服务只引用一个代码库实例，多个服务可共用；全局清单分别维护对象与引用。
- 引入代码库实例登记，维护来源、集成分支及默认 `repositories/<code>` 位置；本地检出目录不再单独建模。
- 兼容读取旧服务登记；显式迁移保持身份、历史定位、代码内容和既有目录，不按相同 Git 地址自动合并或搬迁。
- 项目主页支持关联、解除服务；创建项目时可在过滤框下方通过左对齐入口新增服务，服务抽屉内展开 Git 表单，逐级回填。
- 项目、服务、代码库和技能统一列表进入主页、列表与主页编辑、抽屉保存及版本冲突反馈。
- 更新智能体（Agent）发现和代码准备指引：先核对声明，缺失代码时在统一位置准备，不覆盖已有工作。

## Capabilities

### New Capabilities

- `repository-instance-registry`：代码库实例、来源与分支、位置、局部诊断和准备边界。
- `workspace-asset-relationships`：多对多项目服务关系、多对一服务代码库关系、统一引用与迁移。
- `workspace-asset-management-interactions`：列表、主页、编辑及关联维护的统一交互，创建中的逐级新增与回填。

### Modified Capabilities

- `project-registry`：项目保存服务引用，空项目有效，取消项目内独占服务清单。
- `service-asset-indexing`：全局业务服务登记，代码来源移交代码库实例，兼容旧定位。
- `buildr-web-workspace-application`：直接创建与保留的智能体动作入口分离，资源主页和编辑交互统一。
- `workspace-first-runtime-projection`：平级服务与代码库目录的规则作用域发现。

## Impact

- 后端：`src/modules/workspace/` 的领域、清单、应用、CLI、HTTP 契约，任务与诊断等定位消费者。
- 前端：项目、服务、代码库、技能功能，页面导航、标签、编辑抽屉及生成契约。
- 资产：随包核心规则和 Buildr 技能的项目/服务定位指引，相关规范与当前知识。
- 不操作集鲜真实仓库，不发布，不在普通读取或应用启动时移动用户代码。本任务完成模型与可用交互，实体代码迁移必须独立核对真实 Git 边界。
