---
name: task-triage
description: 开始修改代码、文档、配置或技能等持久文件前使用；确定隔离位置，判断直接实施、事实维护或 OpenSpec 变更，并交接专业动作。
---

# Task Triage Skill

本 Skill只核对任务事实、作出正交决策并交接专业动作；不复制Worktree、OpenSpec或验证手册，也不建立确定性路由器。

## 1. 核对任务事实

只读任务相关范围，不做全量审计。确认：

- 用户希望外部行为或长期事实如何变化；
- 直接相关实现和约束，以及决定当前动作所需的权威来源；
- 登记使用已确认的 Workspace/Project/Service scope；实际需要 Git 操作时再核对相关 repository set，不按目录层级猜测边界；
- 写入授权、不可逆影响和仍需用户决定的语义冲突。

首次修改前，按改动影响核对直接相关实现和约束。小改动不要求遍历规范、知识、测试与登记信息；涉及行为、职责或权威来源变化时，再按需读取相关规范、当前认知、活跃变更、调用方、测试和登记信息，形成有界来源图（Authority Source Map）。来源图仅用于当前工作上下文，不写入任务记录或其他产品状态；只有范围或相关事实变化时才增量刷新。

authority 冲突、授权不明、实际 Git 操作所需的 repository set 不明、不可逆行为缺少决定，或是否进入实现仍未知时，停止对应写入，只询问会改变长期语义、责任边界或授权的最少问题。

### UI Prototype 选择

新页面、主要布局或交互存在实质设计选择，且用户尚未表达原型偏好时，询问是否需要先生成界面原型（UI Prototype）。已有明确偏好继续适用；已明确设计的局部文案、样式或交互修复直接推进，不机械询问。用户主动要求原型时，按下方明确选择边界处理。

只有用户在当前任务中明确确认需要，才在方案已有足够上下文、正式前端实现开始前加载 selected `ui-prototype` Skill。用户拒绝、未确认或直接要求继续时不调用 Skill，正常推进后续流程；不得创建占位文件、waiver、Result、Receipt 或 blocker。UI Prototype 不替代 OpenSpec Change、Planning Review 或正式实现。一旦当前 Task 已生成原型，除非用户明确要求忽略，后续 Agent 必须在正式前端编辑前读取全部相关原型并按其信息架构、布局和交互开发。

用户决定实施且此前讨论已有未被明确忽略的原型时，在正式前端编辑前接续 `ui-prototype` 的“成果保存与接续”：核对确认版、归入适用位置并验证任务展示。此动作承接已有成果，不重新询问是否生成，也不复制迁移或清理流程；是否创建变更仍按下方语义判断，不为展示强造变更。

## 2. 两轴决策

### 语义治理

| 选择 | 判定 | 动作 |
|---|---|---|
| `code-only` | canonical spec 已覆盖目标，且修改不改变可观察契约 | 不创建 Change |
| `spec-maintenance` | specs、实现、registries 或已确认决定已证明当前事实，只需文档追上事实 | 不补造 Change；current knowledge 使用 `maintain` |
| `change-flow` | 改变 SHALL/MUST、API、状态流、权限、业务规则、数据语义、兼容性或其他可观察承诺 | 一个独立业务目标一个 Change |
| `blocked` | authority、业务语义或授权无法确认 | 报告冲突和最少决策问题 |

工程细节默认不进入 OpenSpec；但默认值、存储或内部机制一旦改变外部行为、数据含义、兼容性、安全边界或业务承诺，仍走 `change-flow`。不得用 `spec-maintenance` 绕过新需求评审，也不得用 `code-only` 掩盖规范缺失或事实不明。

若任务改变依赖、构建或测试入口，先把已确认Task scope与变更事实交给`declaration-intake`做只读差异检查；长期`preparation.yml`/`verification.yml`写入按`declaration-intake`的`routine-maintenance|user-decision-required`分类，由对应owner完成；只有后者需要新的用户决定。Triage不直接维护声明。

开发开始时判断预计知识影响，最终新增、修改或删除后复核。已有知识成果受影响时，主动说明受影响成果与建议校准范围；知识维护尚未授权时等待该组授权，已有授权不重复询问。在当前授权内采用 `current-knowledge-maintenance` 维护相关图示、地图、术语和解释；按需调用专业制作方法。普通开发没有规范变化不因此建立 OpenSpec 变更，无影响内容保留，范围外缺口单独提出建议。

开发开始时若目标可能新增、替换或停用参与项目（Project）的服务（Service），采用当前可用的 `project-composition-maintenance` 技能（Skill）核对组成，并在修改结束后按最终事实维护本次受影响的关联。已授权开发中的必要组成校准纳入同次工作；只读请求不写登记。无组成影响时不全量梳理，不新增强制检查或结果门禁。

### 执行形态

- `implementation`：修改代码、运行构建/测试，或需要长期开发上下文。
- `metadata-only`：仅维护 OpenSpec artifacts、Rules、Skills、文档或模板，不进入代码、构建或测试。
- `unknown`：信息不足；先澄清，不提前写 Change artifacts 或当前事实。

该轴独立于语义治理，也不改变下方默认隔离策略。Formal Task Record本身不是编辑、构建或有界测试的通用工作许可。需要依赖、代码生成或运行入口时使用Project/Service的真实wrapper、包管理器和构建工具；工作位置不代表Formal Verification或cleanup事实。

### 默认隔离

首次持久文件修改前确定执行位置：除非用户明确要求在主开发分支修改，否则一律创建或复用当前任务的独立工作树（Worktree）。代码、文档、配置、规则（Rule）、技能（Skill）、模板和 OpenSpec 材料都适用；小改动、纯规划、主目录干净或已授权实现均不构成例外。只读检查、合法任务记录和临时输出无需为此创建工作树（Worktree）。

- 已有当前任务的独立位置：通过 `worktree inspect` 核对任务、真实仓库、分支与登记身份，复用返回的实际根并保留本任务未提交成果；不因新轮次或阶段转换重复创建，也不借用其他任务的位置。
- 尚无匹配位置：向已绑定工作树（Worktree）提供者交接明确的任务标识、工作空间（Workspace）、仓库集合、任务分支与起点提交，使用 `worktree create` 返回的实际根继续。主目录的无关未提交改动不阻止创建；保留现场，不为创建而提交、暂存或清空他人内容。新位置只包含起点提交；依赖未提交成果时先核对其归属和依赖关系。
- 用户明确要求在主开发分支修改：核对实际分支、文件归属与覆盖风险后继续；同一对象、范围与副作用的授权持续有效，无需重复确认。不为默认隔离询问用户是否接受创建。
- 提供者不可用、仓库缺失或位置身份冲突：只停止依赖该位置的持久文件写入，继续可独立进行的只读检查和任务记录，报告具体原因；不自动回退主开发分支、猜测其他目录或初始化仓库。

隔离保护并发任务的文件现场，不承诺合并无冲突；交付时仍核对目标分支与他人改动。

## 3. 条件化交接

已有或刚创建的active Formal Task先`task inspect`核对目标、scope与current record identity。按默认隔离策略取得真实执行位置后再写文件；不补造位置、Plan或Receipt。

按用户目标和当前事实渐进装配专业上下文：执行当前动作前只读取相应Skill、binding、contract与直接authority，Review、Verification、OpenSpec、Parent管理和任务收尾只在真实命中时加载。不得为发现未来阶段运行Doctor full或预读完整专业Result；provider不ready时只阻塞或降级对应分支，保留其他已确认结论。

用户已经授权实现时，在已按默认隔离策略确认的位置和文件ownership、副作用边界内立即推进；OpenSpec、Review、Verification与Finish直接消费实际对象和具体资源owner，不要求统一ready。

需要登记待办、创建任务、选择独立位置、维护当前知识或协调父子任务时，读取[具体交接](references/structured-handoff.md)。

### 任务登记与代码更新

创建或激活任务时，按[登记核对与按需更新](references/task-create-git-baseline.md)确认记录所需事实。登记不要求 Git 更新、干净工作目录、集成分支、上游引用或全局诊断通过；不为登记执行 fetch、rebase 或工作空间同步。后续代码修改、更新与环境使用按实际目标独立核对，登记成功不等于这些动作已就绪。

选择 `change-flow` 时，先确保正式 Task Record，再完成执行位置判断并使用适用的 `openspec-*` Skill。首次采用、状态实质变化、暂停、完成或用户询问时，从 CLI 刷新并报告 change id、resolved path、action、status、progress 和 next action/blocker；未创建时只写 `planned`，不猜测路径或进度。Buildr 自有 artifacts 和用户说明正文使用中文；命令、路径、标识符、协议字段与 OpenSpec 格式关键字可保留英文。

实现型任务按共享实现区域、验证入口或失败影响面分组。工作位置沿用已核对的默认隔离结果，实际Git与owned scope变化时重新判断。Agent直接依据目标、OpenSpec、Git、代码、文件和专业结果推进，不创建研发聚合事实或planning snapshot。需要设计测试框架、划分测试边界、编排场景或为实现开发测试时使用`project-testing`。开发中的测试由Agent直接调用项目工具；开发完成后独立使用selected `buildr.task-verification/v4` provider，只保存有意义的Task验证报告。triage不把验证报告变成Task完成门禁。

## 输出

面向用户说明分流结论、实际影响与下一步；需要结构化交接时，读取[交接字段](references/structured-handoff.md)。

## Guardrails

- 不为过去事实补造 Change 历史，不把 current knowledge 变成第二套规范。
- 不在正式Task首次持久交付写入后才补做Task Record或工作位置决策。
- Git 更新只服务已确认的代码更新目标；Task Record Application和Buildr Web不执行该动作，也不把多仓库操作伪装为原子transaction。
- 不使用未经 authority 或 CLI 确认的路径、状态、进度和完成结论。
- 不把一次集中验证解释为覆盖尚未执行、stale 或存在 coverage gap 的适用 delivery-required capability。
