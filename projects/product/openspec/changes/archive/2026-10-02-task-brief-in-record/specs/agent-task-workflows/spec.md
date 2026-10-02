## MODIFIED Requirements

### Requirement: task-manager Skill 必须作为 Buildr Web 与 CLI 共享的 Task Record 薄管理入口
Buildr MUST交付现有`task-manager` workspace Skill作为`buildr.task-record/v4`默认provider，指导Agent创建、读取和维护正式Task Record。`task-manager` MUST不成为全局任务dispatcher或父任务流程总管。Buildr Web MUST作为同一Task Record Application的独立人类客户端；任一客户端 MUST不直接访问SQLite或migration scripts。

#### Scenario: 用户明确管理正式 Task
- **WHEN** 用户要求创建、查看、更正、完成或放弃正式Task
- **THEN** Agent MUST使用`task-manager`并先读取当前Task与digest
- **AND** 后续Review、Verification、Git、Worktree、发布和收尾 MUST继续由各自能力负责

#### Scenario: 用户按 Task ID 继续工作
- **WHEN** 用户或Agent提供已有Task ID并要求继续
- **THEN** `task-manager` MUST先inspect canonical Task Record
- **AND** MUST不从Task Record推断工作位置、Git、验证或交付事实

#### Scenario: 人先在 Buildr Web 创建 Task
- **WHEN** 用户查找Buildr Web任务创建入口
- **THEN** 页面 MUST不提供创建入口并引导交给Agent表达目标
- **AND** Agent创建后页面 MUST读取同一Task Record事实

#### Scenario: 普通任务请求
- **WHEN** 用户只提出实现、文档、测试、讨论或探索
- **THEN** `task-manager` MUST不因出现“任务”一词自动创建正式记录
- **AND** Agent MUST先判断是否需要长期Task事实

#### Scenario: Skill 返回存储细节
- **WHEN** Task action成功或blocked
- **THEN** Skill MUST只报告业务结果、digest、effects与diagnostic
- **AND** MUST不要求用户编辑SQLite或migration ledger

#### Scenario: Buildr Web修改Task
- **WHEN** 用户在Buildr Web编辑、完成或放弃已有Task
- **THEN** 页面 MUST调用与CLI相同的Application和当前digest保护
- **AND** MUST不通过Skill routing写记录或维护第二状态机

#### Scenario: 创建或继续正式说明
- **WHEN** 用户授权开始或继续 code-only、文档或 OpenSpec 任务
- **THEN** task-manager MUST 通过 Task Record 的 brief 字段保存和读取真实说明，不创建新的 brief 材料引用
- **AND** 其他专业技能 MUST 使用同一记录正文及 @task/<task-id> 稳定引用；旧说明导入 MUST 使用显式产品动作并报告当前事实

### Requirement: 正式执行必须先建立 Task Record
Buildr 的 `task-triage` MUST optional 依赖 `buildr.task-record/v4`，并 MUST 在已确认进入正式持久交付的分支、首次交付写入前调用 selected provider 创建或恢复 Task Record。路径已明确而无需重新 Triage 的正式执行也 MUST 遵守同一前置条件。

#### Scenario: Triage 选择已有契约实现
- **WHEN** task-triage 选择 implementation，且任务即将创建分支或修改交付物
- **THEN** Agent MUST 先创建或恢复 Task Record，再进入当前实际工作位置
- **AND** Task Record provider 不 ready 或操作 blocked MUST 阻止首次交付写入，但不抹去已确认的 triage 结论

#### Scenario: Triage 选择 Change Flow
- **WHEN** task-triage 选择 change-flow 且即将创建首份 OpenSpec artifact
- **THEN** Agent MUST 先创建或恢复 Task Record
- **AND** Change 创建成功后 MUST 通过 Task Manager 将真实 `project/change` 引用加入 active Task Record

#### Scenario: 不形成正式 Task
- **WHEN** triage 选择 explore、纯只读诊断、Task 外单次操作或 metadata 写入只是已有 Task lifecycle 的一部分
- **THEN** task-triage MUST NOT 调用 Task Record create
- **AND** 其他适用的只读或专业动作 MUST 不因 Task Record capability 不 ready 而阻塞

#### Scenario: 已有 Task Record
- **WHEN** 正式执行上下文已提供 Task ID
- **THEN** Agent MUST inspect 并核对 active Task 的 intent/scope
- **AND** MUST NOT 重新 create、从 worktree 名称补造第二个 Task ID 或覆盖终态 Task

### Requirement: 任务目标必须写成简洁清晰的任务需求
Buildr 任务指引 MUST 将 `intent`（目标）定位为一句话级的任务目标与入口定位，而不是完整需求正文。每个新正式执行任务（Task）MUST 在登记与实际工作位置核对后，由任务管理技能（task-manager）形成并保存独立任务说明（Task Brief）到任务记录的 brief 字段，真实表达问题或需求、目标、必要范围与非目标和完成依据；简单任务 MUST 允许简短正文但不得缺失或为空占位。说明 MUST 随理解及已确认范围更新，未知事实 MUST 明示，不强制长模板。任务 MAY 关联零到多个 OpenSpec Change；变更说明（Change Brief）MUST 解释各自具体规范变化并引用唯一任务正文，不重复维护同义任务需求。

#### Scenario: 创建任务时书写需求
- **WHEN** Agent 调用 `task create` 或修订正式执行任务的目标
- **THEN** `intent` MUST 清晰概括任务目标，任务的完整问题、范围和完成依据 MUST 位于独立 Task Brief
- **AND** MUST NOT 只写标题复述、内部记号，或通过拉长 intent 替代正文

#### Scenario: 变更 Brief 与任务目标的分工
- **WHEN** Task 关联一个或多个 OpenSpec Change
- **THEN** Task `intent` MUST 保持短目标，唯一 Task Brief MUST 保持任务级整体需求
- **AND** Change `brief.md` MUST 只解释该变更并引用 Task Brief，两者 MUST NOT 相互复制正文或相互矛盾

#### Scenario: 无 Change 的简单正式任务
- **WHEN** 正式新任务只需一次简单修复或文档维护且 `changes` 为空
- **THEN** 智能体（Agent）MUST 在 Task Record.brief 保存真实短说明，使任务说明节点可直接读取
- **AND** MUST NOT 把空材料、普通顶部链接或 intent 当作已形成任务说明

#### Scenario: 接续旧任务
- **WHEN** 旧任务的记录 brief 为空，而智能体（Agent）主动接续其当前目标
- **THEN** 智能体（Agent）MUST 核对适用正文，通过产品动作显式导入已关联旧正文或形成当前记录说明，并如实说明本次来源和补写
- **AND** MUST NOT 批量补造、改写过去时间、旧 Change Brief、归档或专业历史

### Requirement: 任务说明与材料管理必须遵守独立职责
任务管理技能（task-manager）MUST 指导在 Task Record.brief 形成、保存、更新和接续唯一任务说明（Task Brief），并按实际需要关联零到多个方案、实施和交付材料。任务说明 MUST 由记录维护唯一正文；方案、实施和交付正文 MUST 保留在真实项目或任务本机文件中，其引用 MUST 由独立任务材料应用（Task Materials Application）维护，MUST 不复制进任务记录或专业结果。旧说明只通过显式产品动作导入，原文件保留。Buildr-owned 技能（Skill）及 OpenSpec 增强片段 MUST 表达该分工，MUST NOT 通过修改第三方技能正文或受管投射落地。

#### Scenario: 任务说明更新
- **WHEN** 已确认目标理解或范围变化，需要更新 Task Brief
- **THEN** 智能体（Agent）MUST 重新读取记录 brief，按已观察 recordDigest 更新，并核对实际节点可读；其他过程文件与引用 MUST 按各自版本维护
- **AND** 说明变化 MUST 更新记录版本并保留适用的终态更正历史；其他过程材料保存 MUST 不重写任务状态或历史

#### Scenario: 多任务共享变更或文档
- **WHEN** 多个 Task 引用同一 Change 或适用文档
- **THEN** 各任务 MUST 保持自身独立的记录 brief；共享仅适用于 Change 逻辑引用与合法方案或过程文档
- **AND** 技能（Skill）MUST NOT 强制 Task 与 Change 一对一、覆盖另一任务的记录说明或过程引用

### Requirement: 收尾必须独立于研发交接且按动作检查安全
收尾与交付在日常意图中 MAY表示同一结束目标；task-finish MUST根据真实目标处理成果、已有记录及安全清理，MUST不要求候选、交接或统一验证链。已有正式任务的必要说明与过程材料 MUST 按目标核对记录 brief 保存、过程文件成果交付、材料引用和任务节点实际可读性；记录正文、文件关联与 Task 状态 MUST 分别核对，普通链接可打开不等于说明节点可读。

#### Scenario: 四类组合
- **WHEN** 任务有无 Buildr 记录与有无 Git 管理形成四种组合
- **THEN** 仅调用实际适用能力，无记录不建记录，无 Git 不制造提交

#### Scenario: 已有检查仍适用
- **WHEN** 内容和检查相关条件未改变
- **THEN** MUST复用已有结果，不因收尾、生成新提交或提交编号改变而追加验证

#### Scenario: 具体检查缺口
- **WHEN** 存在相关内容变化或已知错误
- **THEN** MUST选择覆盖实际影响的最小充分已有检查；如确需补测，MUST在推进目标分支前执行并通过，再集成推送。不得按测试条数代替风险和执行成本判断，不创建统一门禁

#### Scenario: 部分成功
- **WHEN** 交付成立但登记或清理失败
- **THEN** 保留交付，继续安全必要动作，说明遗留

#### Scenario: 材料与交付分别核对
- **WHEN** 正式任务的记录说明尚未保存或读取失败，或其他过程文件已交付但引用缺失、引用存在但文件不可读
- **THEN** 收尾 MUST 如实区分记录说明保存、其他文件交付、关联与局部读取缺口，并在授权内处理必要缺口
- **AND** MUST NOT 以 Task completed、Git 推送或顶部链接可打开冒充材料齐备；本机材料清理 MUST NOT 自动完成任务或删除工作树
