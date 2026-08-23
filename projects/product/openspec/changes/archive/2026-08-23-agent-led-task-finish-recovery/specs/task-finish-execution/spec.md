## ADDED Requirements

### Requirement: Task Finish 必须提供统一的可信 current facts
Buildr MUST通过Task Finish Application提供同一组只读current facts，至少表达current Development handoff applicability、Task Contribution、repository topology、current或terminal Finish关联、run与carrier ownership、已发生side effects、remote containment、Delivery、Activation、Environment Cleanup、Diagnostics以及可用安全原语。自动`run`、`task finish reconcile`、`task finish inspect`与Task Entry Snapshot MUST消费同一事实模型；该模型 MUST只引用各专业authority的current identity与有界事实，不得复制专业Result正文、创建第二writer或把调用方声明当成事实。

#### Scenario: 自动 run 与 reconciliation 观察同一事实
- **WHEN** 同一Task分别通过自动`run`或Agent直接交付后的`reconcile`读取Finish上下文
- **THEN** 两条路径 MUST对相同handoff、repository、carrier、remote containment与maintenance事实返回一致identity和applicability
- **AND** 路径选择 MUST NOT改变事实模型或提前写入Delivery

#### Scenario: 未知交付情况仍可读取
- **WHEN** current facts不匹配任何已知自动恢复旅程，但Task、handoff、repository与既有side effects仍可安全观察
- **THEN** Buildr MUST返回这些current facts、精确unknown blocker与可用能力
- **AND** MUST NOT仅因没有预定义恢复状态就伪造stale、Delivery失败或唯一策略

### Requirement: 确定性安全不变量必须与Agent策略分离
Buildr MUST对ownership、identity、path containment、symlink、side-effect containment、remote containment、target fencing、未经授权远端写入、完成真实性与安全删除保持fail-closed保护。Git、PR、重新开发、继续或退休旧run、恢复、reconciliation或放弃的策略 MUST由Agent依据current facts选择；Product MUST NOT把策略推荐升级为唯一合法动作、执行授权或全局workflow状态。

#### Scenario: 安全不变量不成立
- **WHEN** carrier owner、run identity、remote target、containment proof或删除边界任一无法证明
- **THEN** Buildr MUST在对应副作用前停止并返回精确blocker与已发生effects
- **AND** MUST NOT通过推荐动作、caller claim或兼容分支绕过不变量

#### Scenario: 多个合法策略同时存在
- **WHEN** current facts同时允许Agent选择直接Git/PR后reconcile、继续自动run或回到Task Development
- **THEN** Buildr MUST把这些能力及各自required prerequisites投影给Agent
- **AND** MUST NOT自动选择、排序执行或把其中一个声明为唯一正确动作

### Requirement: Finish 恢复原语必须少量、封闭且可幂等验证
Product-owned Finish恢复原语 MUST只接受由Task Finish解析的Task、run、handoff与current facts identity，并在写入前重新验证资格。精确carrier清理 MUST只处理已登记、真实非symlink、受预期container包含且没有未交付内容的owner资源；旧run退休 MUST只在current Handoff已由真实remote containment完整证明、旧run停止于delivery前且没有lease、delivery、retained、prepared completion、cleanup或后续phase事实、repository topology未变化并且全部carrier ownership与cleanup可证明时执行。任一原语 MUST逐项报告effects、支持相同identity幂等重试，并拒绝caller提供任意path、claimed success、状态patch或语义等价boolean。

#### Scenario: 精确 carrier 可安全清理
- **WHEN** Product证明carrier及container属于matching Task/run、路径真实且受控、没有未交付内容并满足当前cleanup资格
- **THEN** cleanup原语 MUST只删除该owner的精确资源并报告逐项effects
- **AND** 相同identity重试 MUST不触碰其他run或扩大删除范围

#### Scenario: 旧 run 可安全退休
- **WHEN** current Handoff已从真实remote证明全部Task Contribution contained，旧run满足delivery前无副作用资格且carrier cleanup全部可证明
- **THEN** retirement原语 MUST以旧run ID与精确digest作为transaction fence原子退休旧current并允许current Handoff结果对账
- **AND** MUST保留旧Execution Record与有界superseded关联

#### Scenario: 原语资格无法证明
- **WHEN** 任一ownership、identity、topology、remote containment、phase或cleanup事实缺失、漂移或矛盾
- **THEN** 原语 MUST零写入返回blocker并保留现场
- **AND** MUST NOT退化为通用delete、reset、migration或旧Candidate复用接口

## MODIFIED Requirements

### Requirement: Blocked Task Finish 必须只返回一个当前恢复动作
Task Finish与Task Entry Snapshot MUST根据current Development applicability、Finish current facts和run-owned事实投影typed blockers、required安全前置与available capabilities。只有继续推进会违反确定性authority、identity或side-effect不变量时，产品 MUST返回`required` owner/action；其他恢复、重新开发、Git、PR、reconciliation、cleanup、retirement或放弃选择 MUST作为可用能力或`recommended`提示交给Agent判断。兼容`nextWorkflow`或`nextAction`字段若仍存在，MUST从同一typed projection派生为非规范性提示，不得成为唯一合法路径或执行授权。

#### Scenario: Delivery Adaptation阻塞
- **WHEN** Task Contribution不能机械应用到最新Delivery Baseline但Development handoff仍current，并且Agent仍可选择run-owned adaptation、直接Git/PR后reconcile或停止交付
- **THEN** result MUST返回current carrier、baseline、ownership blocker和这些能力各自的required prerequisites
- **AND** MUST NOT把恢复同一run投影为唯一正确动作或自动进入Task Development rebuild

#### Scenario: Development applicability真实stale
- **WHEN** Task Development Application报告current handoff不再适用
- **THEN** result MUST把Task Development标记为解除该identity blocker的required owner
- **AND** MUST保留既有Finish side effects与资源事实，不得把required前置解释为自动重新开发、自动删除或放弃授权

#### Scenario: 未知 blocker 没有预定义策略
- **WHEN** Buildr能安全观察current facts但无法确定Agent应选择的交付策略
- **THEN** result MUST返回unknown blocker、相关事实与仍安全可用的能力
- **AND** MUST NOT生成虚假的唯一`nextAction`、完成结论或开放式状态迁移
