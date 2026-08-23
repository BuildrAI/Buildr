## MODIFIED Requirements

### Requirement: Finish 恢复原语必须少量、封闭且可幂等验证
Product-owned Finish恢复原语 MUST只接受由Task Finish解析的Task、run、handoff与current facts identity，并在写入前重新验证资格。精确carrier清理 MUST只处理已登记、真实非symlink、受预期container包含且没有未交付内容的owner资源。用于远端reconciliation的旧run退休 MUST继续要求current Handoff已由真实remote containment完整证明；用于显式本地换代的旧run退休 MUST只允许旧run停止于已知的`task-finish.task-contribution-drift-unresolved` prepare blocker，且blocked run仍持有该blocker生成的原run resume token、failed run没有resume，并同时满足没有lease、delivery、retained、prepared completion、cleanup或后续phase事实、repository topology未变化、全部carrier ownership与cleanup可证明，以及每个carrier的HEAD、index、worktree与untracked内容精确匹配Product首次返回该carrier时持久化且后续不可刷新的可丢弃性证明。任一原语 MUST逐项报告effects、支持相同identity幂等重试，并拒绝caller提供任意path、claimed success、状态patch、carrier-clean boolean或语义等价boolean。

#### Scenario: 精确 carrier 可安全清理
- **WHEN** Product证明carrier及container属于matching Task/run、路径真实且受控、没有未交付内容并满足当前cleanup资格
- **THEN** cleanup原语 MUST只删除该owner的精确资源并报告逐项effects
- **AND** 相同identity重试 MUST不触碰其他run或扩大删除范围

#### Scenario: 旧 run 可安全退休
- **WHEN** current Handoff已从真实remote证明全部Task Contribution contained，旧run满足delivery前无副作用资格且carrier cleanup全部可证明
- **THEN** retirement原语 MUST以旧run ID与精确digest作为transaction fence原子退休旧current并允许current Handoff结果对账
- **AND** MUST保留旧Execution Record与有界superseded关联

#### Scenario: 本地安全换代旧 run
- **WHEN** current Handoff尚未形成remote containment，旧run因已知Task Contribution漂移停在prepare blocker，blocked run持有matching原run resume token或failed run没有resume，且全部carrier内容仍精确匹配Product首次交接时持久化的可丢弃性证明
- **THEN** 显式换代原语 MUST精确清理旧carrier，并以旧run ID与精确current digest为fence原子写入绑定current Handoff的新active run
- **AND** MUST保留旧Execution Record与有界superseded关联，MUST NOT复用旧Candidate、handoff、Verification或Delivery Adaptation结论

#### Scenario: carrier 在 prepare 失败后被修改
- **WHEN** 任一carrier的HEAD、index、worktree、untracked内容、owner、container或topology不再匹配持久化证明
- **THEN** 本地换代原语 MUST零写入保留旧current row与全部现场
- **AND** MUST返回精确carrier-disposability blocker，不得把clean working tree或caller声明作为替代证明

#### Scenario: 其他 prepare blocker 或 resume token
- **WHEN** 旧run因Delivery Adaptation、target race、外部故障或其他原因blocked，或resume token不再绑定已知Task Contribution漂移blocker
- **THEN** 本地换代原语 MUST保持unavailable并保留原run恢复语义
- **AND** MUST NOT仅因carrier内容仍匹配某次观察就退休旧run

#### Scenario: 原语资格无法证明
- **WHEN** 任一ownership、identity、topology、phase、side-effect、carrier disposability、remote containment或cleanup事实缺失、漂移或矛盾
- **THEN** 对应原语 MUST零写入返回blocker并保留现场
- **AND** MUST NOT退化为通用delete、reset、migration或旧Candidate复用接口

## ADDED Requirements

### Requirement: Task Finish 必须提供显式的旧 run 安全换代动作
Task Finish MUST提供显式、Product-owned且由current facts token保护的旧run安全换代动作。调用方 MUST只提交Task、canonical target、Product返回的recovery token与current Handoff所需语义commit message；MUST NOT提交carrier path、run状态patch、claimed cleanup、remote success或等价boolean。普通`task finish run` MUST继续对不同identity的旧current run返回`task_finish.current_run_identity_conflict`，MUST NOT静默调用换代动作。

#### Scenario: Agent 显式选择安全换代
- **WHEN** Finish current facts表明旧run为`stale-run-retirable`，且Agent使用matching recovery token显式请求换代
- **THEN** Product MUST在副作用前重验Task、current Handoff、旧run digest、资格与全部carrier事实
- **AND** 成功后 MUST返回绑定current Candidate generation的新active run及后续正常run/resume能力，不得在换代动作中执行远端Delivery

#### Scenario: recovery token 或 current row 漂移
- **WHEN** recovery token不匹配当前facts identity，或旧current row的run ID、kind、status、digest任一变化
- **THEN** Product MUST零覆盖返回类型化current conflict
- **AND** MUST NOT删除竞争者资源、替换current row或创建第二个新run

#### Scenario: cleanup 后事务前中断
- **WHEN** 旧carrier已由本动作精确清理，但SQLite current替换尚未提交即发生中断
- **THEN** 相同old run与token的重试 MUST把已登记carrier缺失识别为幂等cleanup结果并重新执行current-row fence
- **AND** MUST NOT因此放宽owner、container、topology、side-effect或digest检查

#### Scenario: 多 repository 部分清理失败
- **WHEN** 多repository旧run中仅部分已证明carrier清理成功
- **THEN** Product MUST保留旧current row并逐selector报告已发生与未发生effects
- **AND** 后续重试 MUST只处理仍由该old run拥有的剩余资源

### Requirement: Finish current facts 必须暴露可行动的换代资格
Finish current facts与Task Entry Snapshot MUST从同一共享资格投影旧run的恢复disposition、typed blockers、required prerequisites、qualification identity与available capabilities。可安全本地换代时 MUST暴露`finish-rollover`能力及Product生成的有界recovery token；证据不足或存在副作用时 MUST暴露检查现场的能力并保持`finish-rollover` unavailable。Task Entry Snapshot MUST保持只读，不得访问远端证明Delivery、清理carrier、退休run或替Agent选择唯一策略。

#### Scenario: 新 Candidate 被可安全退休的旧 run 阻塞
- **WHEN** current Development Handoff已更新，旧run满足本地换代全部资格且Task尚未完成
- **THEN** Finish facts与Task Entry Snapshot MUST在执行普通run前投影`stale-run-retirable`、matching qualification identity与`finish-rollover`能力
- **AND** Git/PR后reconcile、检查现场、回到Development或放弃等仍合法的能力 MUST按真实事实保持可见

#### Scenario: 旧 run 存在不确定副作用或不可丢失内容
- **WHEN** 旧run存在lease、Delivery/Activation/cleanup事实、carrier内容漂移或任何资格未知
- **THEN** Finish facts与Task Entry Snapshot MUST投影精确blocker并使`finish-rollover` unavailable
- **AND** MUST保留现场，不得把通用`finish`提示伪装成已经可以安全换代

#### Scenario: task next 不探测远端
- **WHEN** current facts尚无Product-owned remote containment observation
- **THEN** Task Entry Snapshot MUST只报告reconciliation所需前置与可用能力
- **AND** MUST NOT自行访问remote、声明新贡献已交付或把reconciliation选为唯一动作
