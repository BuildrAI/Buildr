# 项目与服务测试验证框架的实现地图

本图说明 Buildr 为用户项目（Project）及服务（Service）提供的测试建设方法、项目测试地图与任务验证报告（Task Verification Report）怎样落实到产品代码。它回答“修改某项职责应从哪里读代码”，流程和判断方法见[完整验证框架](../docs/architecture/workspace-testing-and-verification-framework.md)，使用主线与能力分工见[测试建设与使用图](../archify/flows/verification-framework.html)。

以下路径相对于 `projects/product/`。规范和实现是事实源；本文、文章与图是解释成果。目录只展开与主题有关的分支，不代表完整文件清单。

## 工作方法怎样协作

| 方法 | 职责与交接 |
| --- | --- |
| [测试建设（project-testing）](../../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md) | 从公共结果设计必要案例，维护测试及其选择映射；不写项目测试地图或正式报告 |
| [声明接入（declaration-intake）](../../services/buildr/resources/workspace/skills/buildr/declaration-intake/SKILL.md) | 对已有入口做只读发现与差异判断，区分普通维护和需要人决定的变化，交给声明维护者 |
| [任务验证（task-verification）](../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md) | 维护稳定测试族（Testing Family），选择并直接调用工具，开发完成后核对结果并登记报告 |
| [任务收尾（task-finish）](../../services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md) | 消费真实成果、验证和交付事实，完成授权内交付与善后；不把报告当成发布许可 |

这些是智能体（Agent）的工作方法，表中交接不表示软件函数自动调用。用户项目（Project）及服务（Service）的真实测试代码、工具和环境留在各自代码来源；不能从 Buildr 自己的测试目录推断用户已经拥有哪些能力。测试建设（project-testing）是指导建设的技能（Skill），同名软件模块 `project-testing` 只负责地图维护。

## 项目地图：校验和维护稳定入口

规范要求按少量稳定测试族（Testing Family）说明用途、范围、发现位置和入口。`createVerificationModule()` 依赖工作空间查询能力（Workspace Query），向命令行（CLI）提供读、校验、更新，向诊断和任务验证提供具名声明能力。应用层（Application）根据已登记项目或服务来源解析当前根，返回逐族执行位置与局部诊断；领域层（Domain）校验字段、服务绑定及相对路径，文件写入通过注入的 `atomicWriteFile` 完成；没有单独的地图数据库。

- **`openspec/specs/`** — 相关规范与引用范围
  - [project-testing-guidance/spec.md](../../openspec/specs/project-testing-guidance/spec.md) — 测试质量、最低充分边界、反例和稳定入口指导
  - [project-declaration-intake/spec.md](../../openspec/specs/project-declaration-intake/spec.md) — 声明发现、维护与责任交接；具体字段以所引 v4 要求和领域模型为说明依据
  - [project-test-capabilities/spec.md](../../openspec/specs/project-test-capabilities/spec.md) — 本文引用其 v4 要求，解释测试地图结构、范围、版本更新与模块边界
  - [task-verification/spec.md](../../openspec/specs/task-verification/spec.md) — 当前报告、结果约束、适用性、版本比较及合法写入者
  - [product-verification-quality/spec.md](../../openspec/specs/product-verification-quality/spec.md) — Buildr 产品证据分类、发现、选择、资源和质量要求
  - [node-test-context-runtime/spec.md](../../openspec/specs/node-test-context-runtime/spec.md) — 可复用测试上下文（Test Context）的公共行为
- **`services/buildr/src/modules/project-testing/`** — 项目测试地图模块
  - [module.ts](../../services/buildr/src/modules/project-testing/module.ts) — 声明依赖、公开应用与声明能力、登记命令行（CLI）和诊断入口
  - `interfaces/cli/`
    - [project-verification.ts](../../services/buildr/src/modules/project-testing/interfaces/cli/project-verification.ts) — 解析 `inspect|validate|update` 参数并委托应用
  - `application/`
    - [project-verification-application.ts](../../services/buildr/src/modules/project-testing/application/project-verification-application.ts) — 读取地图与摘要、校验候选、解析 `locations`、比较 `expectedIdentity` 后写入；位置诊断只影响相关测试族，不执行测试
    - [project-verification-locations.ts](../../services/buildr/src/modules/project-testing/application/project-verification-locations.ts) — 根据真实登记观察每族根和命令目录，隔离不可用目录并拒绝实际目录越界
  - `domain/`
    - [project-verification.ts](../../services/buildr/src/modules/project-testing/domain/project-verification.ts) — 封闭 v4 字段、登记范围、项目／服务路径根绑定、安全相对路径与命令形状的校验和规范化

## 任务报告：保存事实并计算适用性

`registerTaskVerificationApplication()` 从任务范围读取地图，通过声明能力解析和校验，关联每项检查。它派生地图状态和完成时间，并组织事务（Transaction）；`registerTaskVerificationRepository()` 保存唯一当前报告。内容身份由调用方提供，系统不会执行测试来复核摘要。

- **`services/buildr/src/modules/task/`** — 正式任务（Task）的专业验证事实
  - `interfaces/cli/`
    - [task-verification.ts](../../services/buildr/src/modules/task/interfaces/cli/task-verification.ts) — 读取报告文件，解析 `inspect|record` 及预期摘要
  - `interfaces/http/`
    - [task-professional-http-contracts.ts](../../services/buildr/src/modules/task/interfaces/http/task-professional-http-contracts.ts) — 定义专业结果的 HTTP 输入契约，与命令行（CLI）共享应用行为
  - `application/`
    - [task-verification-application.ts](../../services/buildr/src/modules/task/application/task-verification-application.ts) — 绑定任务、检查和地图；计算 `current|stale|unknown`，不选择或执行测试
  - `domain/`
    - [task-verification.ts](../../services/buildr/src/modules/task/domain/task-verification.ts) — 校验检查、缺口、可移植引用及三类报告结论
  - `persistence/`
    - [task-verification-repository.ts](../../services/buildr/src/modules/task/persistence/task-verification-repository.ts) — 读写 `task_verification_current`，在事务（Transaction）内比较摘要、替换及写后核验
- **`services/buildr-web/src/features/task/components/`** — 从页面接续工作
  - [TaskAgentAction.tsx](../../services/buildr-web/src/features/task/components/TaskAgentAction.tsx) — 根据当前任务形成开始、接续和验证指令；界面发起协作，不代替测试执行

地图失效只影响声明关联：真实检查可保留并明确 `map-unavailable`。报告失效也不自动重跑、完成任务或覆盖其他人的新报告。

## 用哪些检查核对这套架构

- **`services/buildr/test/`** — 代表性行为依据
  - `unit/`
    - [project-verification-v4.test.ts](../../services/buildr/test/unit/project-verification-v4.test.ts) — 地图结构、路径根绑定、畸形字段与安全路径边界
    - [task-verification-report.test.ts](../../services/buildr/test/unit/task-verification-report.test.ts) — 报告结构及结论约束
  - `integration/`
    - [application-payload-release.test.ts](../../services/buildr/test/integration/application-payload-release.test.ts) — 真实离线安装后，外部服务地图位置与任务报告仍可通过公开命令使用
    - [project-verification-map.test.ts](../../services/buildr/test/integration/project-verification-map.test.ts) — 真实登记下的项目／外部服务根、局部不可用、目录越界与版本写入行为
    - [task-verification-report.test.ts](../../services/buildr/test/integration/task-verification-report.test.ts) — 任务、地图、当前报告与存储的协作

正文和图的解释修改只验证受影响成果；产品行为或测试工具改变才运行对应行为检查。通用能力边界见[主文](../docs/architecture/workspace-testing-and-verification-framework.md)。Buildr 自身的执行编排另见[采用实例的工具地图](product-verification-tools.md)，其中的 npm 命令、依赖图（DAG）与测试上下文（Test Context）不成为通用框架要求。
