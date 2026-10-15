## ADDED Requirements

### Requirement: 源码结果必须按实际输入复用并保留来源
Buildr 验证 SHALL由现有运行器生成、保存和核验源码结果，匹配代码内容、测试与配方、依赖和必要环境/Git事实；提交与运行编号 SHALL作为追溯信息，MUST NOT无条件使同输入结果失效。未知输入范围 MUST保守匹配完整相关内容或不复用。结果 MUST完整通过、输入执行前后一致且清理干净；新失败或漂移 MUST使同身份旧成功不可继续命中。

#### Scenario: 本机再次执行相同检查
- **WHEN** 代码、测试、依赖及所需环境均未改变且已有完整成功结果
- **THEN** 本机运行器 SHALL复用结果并返回原来源，不再次启动该检查
- **AND** 强制诊断 SHALL真实执行，失败时 MUST使同身份旧成功失效

#### Scenario: 修改相关输入或运行中漂移
- **WHEN** 相关输入改变、证明范围未知或执行中内容漂移
- **THEN** 对应旧证明 MUST不可用于通过判断，运行器 SHALL执行需要的检查
- **AND** 未受影响且可证明有效的结果 SHALL继续保留

### Requirement: 受控候选必须消费合法本机结果并只补齐必要检查
受控手动候选 SHALL接收运行器生成的可搬运源码结果并按当前实际输入核验，支持合法本机和其他远端运行的来源；MUST NOT接受手工布尔值、失败或不完整结果替代真实证明。核对者所在平台 MUST NOT被冒充为原执行平台。普通不可信合并请求 MUST NOT通过自带结果跳过检查。完整候选 SHALL仍具有全部所需平台及最终原包消费证明。

#### Scenario: 本机完整验证后准备候选
- **WHEN** 本机已完成适用源码检查且结果与冻结内容及配方匹配
- **THEN** 远端 SHALL复用这些源码结果，仅执行必要缺项和最终包检查
- **AND** 计划与汇总 MUST说明执行、复用和缺项，不因换提交或远端运行无差别重跑

#### Scenario: 本机平台不能证明另一平台
- **WHEN** 提供的结果不满足所需操作系统或明确工具环境条件
- **THEN** 该平台所需检查 MUST继续实际执行，不从本机通过推导

#### Scenario: 结果运输超过受控输入限制
- **WHEN** 精简结果仍超过允许体积或结构无法核验
- **THEN** 派发 MUST在产生新远端执行前给出明确诊断，MUST NOT静默丢弃结果并重新整套执行

## MODIFIED Requirements

### Requirement: 同一验证执行必须复用 admission evidence
Buildr MUST 通过单一去重 DAG 组合 admission 与主计划；同一 step identity 在一次 changed/candidate execution中 MUST 最多执行一次，且 timing summary、diagnostics和最终状态 MUST属于同一run。系统 SHALL 由现有运行器维护可重建源码结果缓存和可搬运证明，MUST NOT 创建第二正式任务 Result authority 或调用方手工 evidence writer。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: Fast step同时属于原始 Full plan
- **WHEN** Candidate plan已经包含 Unit、Contract或其他Fast step
- **THEN** admission composition MUST 复用该 step identity并只执行一次
- **AND** 后续步骤 MUST 把同一passed result作为依赖完成事实

#### Scenario: Admission 通过后主 DAG 失败
- **WHEN** admission steps全部passed但后续重型step失败
- **THEN** 最终 timing summary MUST 同时保留admission与主DAG结果
- **AND** 整体结果 MUST failed且不得把早期passed evidence误报为独立正式Verification Result

#### Scenario: 同一验证执行必须复用 admission evidence遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: Candidate shard evidence 必须可独立重跑且可聚合
每个 Candidate shard和Host Node tuple MUST写出closed机器可读 evidence；稳定 aggregate gate MUST只在全部预期 evidence current、identity一致、覆盖完整且required results passed时通过。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 全部分片通过
- **WHEN** aggregate读取一个Candidate run的全部evidence
- **THEN** evidence MUST绑定相同source SHA、registry identity和适用的artifact digest
- **AND** 每个预期shard与Host Node tuple MUST恰好存在一次
- **AND** 全部required coverage units MUST无遗漏且结果passed
- **AND** aggregate MUST输出稳定、与内部shard名称解耦的Required Check结果

#### Scenario: 分片失败或证据缺失
- **WHEN** 任一shard失败、blocked、未启动、evidence缺失/损坏、identity漂移或coverage不完整
- **THEN** aggregate gate MUST失败并列出精确shard、coverage unit和原因
- **AND** MUST NOT 用其他平台成功或未经相关输入匹配的旧run evidence替代

#### Scenario: 同一SHA重跑失败作业
- **WHEN** 维护者在同一workflow run内重新运行失败job
- **THEN** GitHub MAY复用已经通过的job和同一run artifact
- **AND** 只需重新执行失败shard及依赖它的aggregate gate
- **AND** 重跑shard MUST以同一逻辑artifact名称替换旧attempt evidence，不得因artifact不可变性产生同名冲突或把新旧结果同时交给aggregate
- **AND** 新source SHA MUST触发相关输入重新核验；不匹配结果 MUST失效，完整当前门禁 SHALL 由实际执行或有效源码结果补齐，包字节改变 MUST重新取得对应包消费证明

#### Scenario: Candidate shard evidence 必须可独立重跑且可聚合遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 黄金生命周期优化必须保留真实主证据并记录分段成本
在共享准备与夹具层面，Buildr Product MUST 仅复用不承担 primary evidence 的只读准备，并 MUST 为每个被优化黄金 owner 保留独立可写 sandbox、至少一条完整真实初始化与生命周期路径，以及 prepare、body、wait、cleanup 的改造前后实测；优化 MUST NOT 用缓存的产品响应替代真实主证据、扩大全局并发、共享可写状态或削弱 Candidate/Release authority。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 多个 Finish case 使用相同 Git 基线
- **WHEN** 多个 Finish journey 需要相同的初始 Git remote 与 attached checkout
- **THEN** verifier MAY 通过现有 Prepared Fixture Provider 为每个 case 物化独立副本
- **AND** 每个 case MUST 使用独立 remote、checkout、worktree、SQLite 和 cleanup namespace
- **AND** owner MUST 保留至少一条从空目录开始的真实 Git 初始化、Finish delivery、remote readback 与 cleanup 路径

#### Scenario: 验收黄金 owner 优化
- **WHEN** 黄金 owner 的执行路径发生优化
- **THEN** evidence MUST 给出同 tree、同 owner 的改造前后 prepare、body、wait、cleanup 和 wall-clock 实测
- **AND** 三轮干净 Core、一次 Core/affected 竞争和一次完整 Candidate/Release MUST 保持既有 primary evidence 与 Release-only coverage
- **AND** 失败后重复执行 MUST NOT 污染其他 Task、retained Workspace、Git fixture、进程或用户 profile

#### Scenario: 准备复用没有稳定收益
- **WHEN** 多轮实测证明 Prepared Fixture 物化不快于独立准备，或会模糊唯一 primary evidence
- **THEN** verifier MUST 保持独立执行并记录原因
- **AND** 维护者 MUST NOT 为达到预设数字继续扩建基础设施或降低证据强度

#### Scenario: 黄金生命周期优化必须保留真实主证据并记录分段成本遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 日常 Core 慢 owner 必须具有闭合 primary evidence map
Buildr Product MUST 从唯一 verification registry 为日常 Core 中的慢 Integration/System owner 派生 primary evidence map。每项 MUST 明确待证明事实、公共可观察结果、反例、证据角色和唯一 `primaryEvidenceOwner`；primary owner 不存在、多个 owner 同时声称同一主证据或 supporting owner 无法解析到 primary owner时，contract MUST在执行前失败关闭。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 慢 owner 承担唯一主证据
- **WHEN** 日常 Core 中一个达到审计阈值的 Integration或System owner由自身承担公共事实主证据
- **THEN** evidence map MUST将其标为primary并输出公共结果和能使该owner失败的反例
- **AND** 同一公共事实 MUST不得存在第二个primary owner

#### Scenario: 重型 owner 只承担组合辅助证据
- **WHEN** 低成本owner已经以反例充分证明公共行为且重型owner只验证跨边界组合
- **THEN** 重型owner MUST引用唯一低成本`primaryEvidenceOwner`并标为supporting
- **AND** planner、报告或文档 MUST不得继续把该重型owner声明为相同事实的主证据

#### Scenario: 真实黄金边界不可替代
- **WHEN** owner的公共结果依赖真实CLI、Git、进程、Workspace初始化、迁移、Finish、自举或cleanup边界
- **THEN** evidence map MUST保留至少一个穿过该真实边界的primary owner并说明低层反例不能替代的原因
- **AND** Test Context、mock或缓存的产品响应 MUST不得替代该主证据；同输入既有完整成功主证据 SHALL 按统一结果复用约定核销

#### Scenario: 日常 Core 慢 owner 必须具有闭合 primary evidence map遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 本地 affected 与 Full 必须先通过同次 admission wave
Buildr 本地 `test:changed` 与 `test:candidate` MUST 在同一 verification execution 中先运行低成本 Fast steps；当原计划包含验证框架 canary时 MUST 同时纳入 admission wave。所有非 admission steps MUST 等待 admission 全部通过；任一 admission step失败时，尚未启动的重型 Integration、System、Workspace、package 或 artifact steps MUST 被 blocked且不得产生执行副作用。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 验证框架变化包含廉价错误
- **WHEN** registry、planner、changed runner 或 execution contract 变化使 Fast 或 verification canary失败
- **THEN** 本地 affected/full MUST 在 admission wave结束时返回失败
- **AND** MUST NOT 启动依赖该 wave 的重型 Candidate steps

#### Scenario: 普通领域变化运行 affected
- **WHEN** changed plan非空且没有选择 verification canary
- **THEN** runner MUST 先运行 Fast admission并在通过后运行原 affected owners
- **AND** MUST NOT无条件加入与该领域无关的 System canary

#### Scenario: GitHub Candidate 运行分布式投影
- **WHEN** `dev → main`或手工 Candidate 使用 GitHub shard topology
- **THEN** 现有 preflight phase MUST 包含 Fast owners与verification canary，并在失败时阻止 artifact和verification phases
- **AND** stable `Candidate gate`、artifact复用与后续shard边界 MUST 保持不变

#### Scenario: 本地 affected 与 Full 必须先通过同次 admission wave遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: HTTP 契约 Fresh Build 输入必须在 Fast admission 中闭合
Buildr Product MUST 为 HTTP contract generator、服务端 Schema、Buildr DTO、Buildr Web DTO 与 Fresh Build fixture 维护一个测试侧闭合 inventory。`test:changed` 与本地完整 Candidate MUST 在同次 Fast admission 中校验该 inventory；校验失败时，尚未启动的重型 Integration、System、Workspace、package、Browser 或 artifact step MUST保持 blocked且不得产生执行副作用。该 inventory MUST只属于 Product test tooling，不得进入 npm runtime、Project verification declaration、Task Result 或运行时业务缓存。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 新增 HTTP 契约文件但 fixture 未闭合
- **WHEN** 一个已登记 HTTP contract generator、Schema 或生成 DTO 未进入 Fresh Build inventory，或 Buildr/Buildr Web 两端输出缺失
- **THEN** Fast admission MUST以稳定诊断失败并列出缺失的逻辑文件
- **AND** `system-fresh-build`及其他尚未启动的重型 step MUST不启动

#### Scenario: inventory 完整
- **WHEN** 所有登记 generator、Schema 与两端 DTO 均存在且 Fresh Build fixture消费同一 inventory
- **THEN** Fast admission MUST通过该静态 owner，并让原 affected/full plan按现有依赖继续
- **AND** 同一 owner identity MUST在该次执行中最多运行一次

#### Scenario: 独立 Fresh Build System evidence
- **WHEN** `system-fresh-build` 被 affected、focus 或 Candidate plan选择
- **THEN** System fixture MUST从闭合 inventory复制最小 HTTP contract inputs并执行真实 npm-ci 与 build:web
- **AND** Fast 静态检查 MUST不冒充该 System evidence

#### Scenario: HTTP 契约 Fresh Build 输入必须在 Fast admission 中闭合遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: daily-full、Product Artifact Candidate 与 Published Release 必须分离新增证据
Buildr Product MUST 让 daily-full 只包含完整日常证据；Product Artifact Candidate MUST 在完整日常证据上增加 exact artifact、package、install 和 compatibility evidence；Published Release MUST 复用 matching verified Candidate 并只增加 publish、published install/launcher smoke 与 registry/readback 等 Release-only evidence。普通 Task daily-full MUST NOT吸收 Candidate-only 或 Release-only primary evidence。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 执行完整日常证据
- **WHEN** `product.full-regression` 或合法 Full 升级运行 daily-full
- **THEN** plan MUST 选择唯一 registry 中完整日常 evidence set
- **AND** MUST NOT选择 tarball、package install、Launcher、publish、release smoke 或 registry readback primary evidence

#### Scenario: 形成 Product Artifact Candidate
- **WHEN** `product.candidate` 验证 exact source 与候选制品
- **THEN** verifier MUST 核销完整 daily evidence（实际执行或有效源码结果）并执行 Candidate artifact evidence
- **AND** MUST 保持唯一 Candidate generation、tarball identity 和既有 Host Node/Launcher/package coverage

#### Scenario: 验证 Published Release
- **WHEN** 正式 Release workflow 消费 matching verified Candidate
- **THEN** workflow MUST 针对实际发布物和发布结果执行 Release-only evidence
- **AND** MUST NOT 重跑或重建另一份 Candidate 来替代 matching artifact、publish transaction 或 readback authority

#### Scenario: daily-full、Product Artifact Candidate 与 Published Release 必须分离新增证据遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 开发反馈、完整Candidate与正式Release不得重复主证据
Buildr Product MUST让focused/changed/affected开发反馈、冻结release source上的完整Product Candidate与正式Release artifact验证各自只承担其primary evidence；同一执行内每个verification step MUST去重，同一release source SHA/tree MUST只有一个matching Candidate generation和一个不可变tarball，正式publish MUST消费该tarball及matching Candidate evidence而不得重跑完整Candidate regression。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 开发阶段选择affected反馈
- **WHEN** Agent或PR对未冻结内容运行changed、focus或affected入口
- **THEN** planner MUST只选择真实受影响owner及其admission依赖
- **AND** 该入口 MUST NOT隐式调用完整Candidate profile、把开发反馈声明为完整Candidate或改变release集合

#### Scenario: 冻结内容形成完整Candidate
- **WHEN** current release HEAD/tree与planning bytes冻结并启动完整Product Candidate
- **THEN** verifier MUST完整覆盖required owner集合且每个step最多一次
- **AND** Hosted Windows、Host Node、Launcher、exact Node/PATH、primary owner、bounded scheduling、heartbeat/checkpoint与timing MUST继续复用当前registry基线
- **AND** 所有artifact consumer MUST消费同一个release source、registry与tarball identity

#### Scenario: 正式发布消费Candidate
- **WHEN** maintainer授权对matching current main/release Candidate执行正式release workflow
- **THEN** workflow MUST验证并消费同一冻结tarball，完成tag、npm integrity、dist-tag、GitHub Release与安装后readback
- **AND** workflow MUST NOT调用完整Product Candidate入口、重新pack或生成第二份可发布bytes
- **AND** release SHA、Candidate generation、artifact manifest或main tree任一漂移 MUST在公共mutation前失败关闭

#### Scenario: 开发反馈、完整Candidate与正式Release不得重复主证据遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: CI Candidate 必须由可验证的分布式覆盖计划组成
Buildr Product MUST 从统一 verification registry 为一个精确 source SHA 生成闭合的 CI Candidate coverage plan，并 MUST 让 preflight、artifact producer、平台 shard、Host Node tuple 和 aggregate gate 共同证明完整发布门禁；本地完整 Candidate MUST 继续从同一 registry覆盖全部 Candidate steps。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 生成分布式 Candidate 计划
- **WHEN** CI 为 `dev → main` 的精确 PR head SHA 生成 Candidate plan
- **THEN** 每个 Candidate primary step MUST 至少属于一个已登记 coverage unit
- **AND** 非平台复验 step MUST 恰好属于一个 primary coverage unit
- **AND** 只有 registry 明确声明需要多平台证明的 step MAY 出现在多个平台 coverage unit
- **AND** 完整 coverage unit 并集 MUST 保留本地完整 Candidate 的全部 required gate identities

#### Scenario: 分布式计划漂移
- **WHEN** Candidate step 缺少 shard owner、出现未授权重复、引用未知 runner/platform、artifact consumer 没有 artifact source 或 Host Node tuple 不完整
- **THEN** registry/architecture verifier MUST 在启动昂贵 verifier 前 fail closed
- **AND** 诊断 MUST 标识缺失、重复或非法的 coverage unit

#### Scenario: CI Candidate 必须由可验证的分布式覆盖计划组成遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 产品验证必须提供分层入口
Buildr 产品验证 MUST 将测试证据层、主要门禁和故障定位入口明确分离：维护者主要工作流 MUST 收敛为 fast、changed、core 和 candidate 四种门禁，Unit、Component、Contract、Integration 与 System MUST 保留直接定位入口；Fast MUST 只包含可频繁执行的低成本证据，需要多轮真实 Workspace/Git 演进、大量 CLI 子进程或失败恢复矩阵的 verifier MUST 使用独立 affected/full step identity，并 MUST 仍可由 changed/focus 定点选择。Core MUST 表达日常完整回归的 primary evidence，Candidate MUST 在冻结目标上保留完整 Product Candidate 与正式 Release artifact evidence。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 普通任务运行默认测试
- **WHEN** 维护者或 Agent 在 Product checkout 运行 `npm test` 或 `npm run test:fast`
- **THEN** verifier MUST 运行 Unit、Component、低成本 Contract、架构、canonical spec quality/strict 和全部 runtime adapter 低成本契约
- **AND** verifier MUST NOT 执行完整 CLI/Workspace/System、多轮真实 Git 演进、npm pack/install、网络访问或发布生命周期

#### Scenario: 根据改动运行验证
- **WHEN** 维护者或 Agent 运行 `npm run test:changed`
- **THEN** verifier MUST 根据 Git diff 或显式 Product 路径选择最小验证 DAG
- **AND** 实现路径命中重型 System、recovery/migration 主 owner 时 MUST 选择对应 focused step，不得因其不属于 Fast 或 Core 而跳过
- **AND** 选择与执行语义变化触发 Full 时 MUST 执行 core profile，不得隐式扩展为完整 Candidate/Release lane
- **AND** 计划 MUST 解释每个 step 的选择原因并对未映射路径 fail closed

#### Scenario: 运行日常核心 Full
- **WHEN** 维护者、普通冻结 Task 或 Parent integration feedback 显式运行 `npm run test:core`
- **THEN** verifier MUST 从唯一 registry 覆盖全部 core profile steps并执行启动前预算准入
- **AND** core MUST NOT生成 Candidate tarball，也不得执行 package、Launcher、Host Node、open-source candidate 或 release smoke primary evidence
- **AND** core 中每个 step MUST 同时属于完整 candidate profile

#### Scenario: 定点重跑 step 或领域
- **WHEN** 维护者运行 `npm run test:focus -- <step-id|group:<group>>...`
- **THEN** verifier MUST 从统一 registry 选择并去重对应 step
- **AND** verifier MUST 只展开真实执行依赖，不得无条件附加完整 Fast、Core 或 Candidate
- **AND** 未知 selector MUST 在启动验证进程前 fail closed

#### Scenario: 定位测试层
- **WHEN** 维护者直接运行 Unit、Component、Contract、Integration 或 System script
- **THEN** 每个入口 MUST 只执行对应证据边界
- **AND** 这些入口 MUST NOT 被描述为独立发布门禁

#### Scenario: 最终候选运行完整验证
- **WHEN** 实现、自然语言资产、生成资产和 review 修订已经冻结
- **THEN** 维护者或 CI MUST 运行 `npm run test:candidate`
- **AND** candidate verifier MUST 直接编排全部 candidate profile steps，包括真实 Integration、System、recovery/migration、Workspace/Git、package 和 Release artifact steps
- **AND** candidate verifier MUST NOT 使用 diff、group、core membership 或 step selector 缩小覆盖范围
- **AND** candidate verifier MUST 保留产品要求的文档、安全、onboarding、package、runtime adapter、release、managed data、Workspace E2E、OpenSpec 门禁及 timing summary

#### Scenario: 产品验证必须提供分层入口遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: Candidate 必须使用完整 profile 而不依赖 diff
Buildr Candidate MUST 从统一 registry 选择完整 candidate profile、展开全部真实依赖并生成一次冻结 tarball artifact；Candidate MUST NOT 根据 Git diff、changed inputs、固定 step 数量或人工 selector 缩小发布门禁，并 MUST 包含轻量文档质量验证。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 运行完整 Candidate
- **WHEN** 维护者运行 `npm run test:candidate`
- **THEN** planner MUST 选择 registry 中完整 candidate profile 的全部 steps
- **AND** Candidate MUST 保留 docs quality、Workspace、package、runtime、OpenSpec、managed integrity、onboarding、CLI parity 和 release gates
- **AND** 所有 tarball consumer MUST 依赖并复用同一 candidate artifact

#### Scenario: Candidate registry 漂移
- **WHEN** 既有 required gate 不再属于 candidate profile、docs quality 缺失，或 artifact consumer 未声明 artifact dependency
- **THEN** architecture/registry verification MUST fail before release verification is reported complete
- **AND** verifier MUST 根据 required gate identity 判断完整性，不得把某个固定 step 数作为质量契约

#### Scenario: Candidate 必须使用完整 profile 而不依赖 diff遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 产品验证必须记录阶段耗时
Buildr 产品总验证 MUST 记录每个阶段和整体 wall-clock elapsed milliseconds，MUST 为 Candidate 总耗时和 Workspace E2E suites 声明目标预算，并 MUST 在成功或失败时生成可供 CI 保存的机器可读 timing summary。


命中源码结果 SHALL 明确标为复用，保留原耗时及来源并单独记录本次查询成本；MUST NOT 伪造新spawn、日志路径或把原执行耗时冒充本次执行。

#### Scenario: 完整验证成功
- **WHEN** 产品总验证全部通过
- **THEN** 人类输出 MUST 展示每个阶段的耗时和总耗时
- **AND** verifier MUST 写出包含 schemaVersion、steps、status、durationMs 和 totalDurationMs 的 JSON summary
- **AND** 有预算的 step 和总结果 MUST 同时记录 `budgetMs` 与 `budgetStatus`
- **AND** summary MUST 记录 Node、平台、架构和 CI 环境元数据
- **AND** 每个 Candidate step MUST 将 stdout/stderr 写入可保存的 diagnostics 文件并在 summary 中记录路径

#### Scenario: 某阶段失败
- **WHEN** 产品验证阶段返回非零状态
- **THEN** timing summary MUST 记录失败阶段、非零状态和已完成阶段耗时
- **AND** 产品验证 MUST 保持该阶段的失败退出状态
- **AND** Workspace E2E 独立运行失败时 MUST 保留失败 fixture 或等价诊断证据并输出位置

#### Scenario: 高耗时专项阶段运行
- **WHEN** Candidate 运行 capability、runtime parity、package、OpenSpec fixtures、onboarding 或其他已识别的高耗时阶段
- **THEN** verifier MUST 为该阶段声明非阻断目标预算
- **AND** 预算状态 MUST 与 Workspace E2E 和 Candidate 总预算使用相同语义

#### Scenario: 阶段超过目标预算
- **WHEN** 某个 Workspace E2E suite 或 Candidate 总耗时超过声明预算
- **THEN** verifier MUST 将对应 `budgetStatus` 记录为 `over` 并输出 warning
- **AND** verifier MUST NOT 仅因超过目标预算改变 step status 或候选退出码

#### Scenario: 阶段处于目标预算内
- **WHEN** 有预算的阶段耗时不超过声明预算
- **THEN** timing summary MUST 将对应 `budgetStatus` 记录为 `within`

#### Scenario: 产品验证必须记录阶段耗时遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: Verification timing 必须暴露调度等待
Buildr verification timing summary MUST 以向后兼容字段记录 step 的调度时间轴，使维护者能够区分排队等待与 executor 执行耗时。


命中源码结果 SHALL 明确标为复用，保留原耗时及来源并单独记录本次查询成本；MUST NOT 伪造新spawn、日志路径或把原执行耗时冒充本次执行。

#### Scenario: Step 成功或失败完成
- **WHEN** scheduler 启动并完成一个 passed 或 failed step
- **THEN** timing summary MUST 为该 step 记录 `queuedAt`、`startedAt`、`finishedAt` 和 `queueDurationMs`
- **AND** `queueDurationMs` MUST 表示从进入候选执行队列到实际启动的 wall-clock milliseconds
- **AND** 既有 `durationMs` MUST 继续表示 executor 执行耗时

#### Scenario: Step 因依赖失败被阻断
- **WHEN** scheduler 在 step 启动前因依赖失败将其标记为 blocked
- **THEN** timing evidence MUST 保留该 step 的 `queuedAt` 和 `blockedAt`
- **AND** verifier MUST NOT 为该 step 生成 `startedAt` 或 `finishedAt`
- **AND** 既有 `durationMs: 0` MUST 继续作为未执行的兼容哨兵

#### Scenario: 旧消费者读取 timing v1
- **WHEN** 消费者只读取 `name`、`status`、`exitCode` 和 `durationMs`
- **THEN** 新增调度字段 MUST NOT 改变这些既有字段的名称或语义

#### Scenario: Verification timing 必须暴露调度等待遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 候选环境准备必须由唯一入口按档位提供
Buildr MUST提供统一候选环境准备（Candidate Environment Preparation）入口，集中拥有Buildr/Buildr Web锁定依赖安装、DTO生成、Test Context生成、源码`web-dist`物化和产物消费者的必要依赖。Candidate与Release Rehearsal jobs MUST只选择统一入口公布的最低充分档位，不得自行拼装这些准备步骤。


环境准备 SHALL 按实际未完成检查的需要供给；命中结果的专属准备 MUST NOT重复执行。准备 operations MUST在开始、完成与失败时保存，准备失败 SHALL表明相应检查未运行。被消费生成物仍 MUST实际存在并匹配。

#### Scenario: 源码运行分片准备环境
- **WHEN** 候选作业选择`source-runtime`档位
- **THEN** 统一入口 MUST安装两个Service的锁定依赖、生成DTO与Test Context并物化matching源码`web-dist`
- **AND** 作业 MUST在准备Result passed后才启动其verification shard

#### Scenario: 不需要前端源码的作业
- **WHEN** Host Node consumer或其他作业不需要Buildr Web源码工具链
- **THEN** 作业 MUST选择最低充分档位并不得安装或构建无关前端材料

#### Scenario: 候选环境准备必须由唯一入口按档位提供遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 候选独立分片必须尽可能收集全部失败
源码分片 MUST只依赖实际必需的准备或产物，不得因无关产物构建失败全部跳过。聚合 MUST区分准备失败、测试失败和依赖缺失未运行，并保留已成功分片证据。


汇总 MUST分别保留准备、原子检查退出、超时及清理事实。超时与先前真实断言失败同时出现时 MUST同时报告；清理失败可使最终动作失败，但 MUST保留原检查已通过事实且不得将该结果写入复用缓存。

#### Scenario: 产物构建失败而源码测试可运行
- **WHEN** 唯一tarball未能生成但独立源码准备可完成
- **THEN** 无tarball依赖的分片 MUST继续运行
- **AND** 产物消费者 MUST记录依赖缺失未运行，聚合不得误报全部测试失败

#### Scenario: 候选独立分片必须尽可能收集全部失败遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 候选生命周期必须区分产品清理失败与harness残留
Release smoke、fresh build和其他高成本lifecycle verifier MUST记录阶段timing，并 MUST把产品ownership cleanup失败与断言完成后的harness临时根删除失败区分处理。


汇总 MUST分别保留准备、原子检查退出、超时及清理事实。超时与先前真实断言失败同时出现时 MUST同时报告；清理失败可使最终动作失败，但 MUST保留原检查已通过事实且不得将该结果写入复用缓存。

#### Scenario: 产品owned cleanup失败
- **WHEN** Launcher、进程、端口、资源owner、Worktree或owned Workspace cleanup无法证明ownership与完成状态
- **THEN** 对应verifier MUST失败并保留诊断
- **AND** aggregate gate MUST失败

#### Scenario: Harness临时根最终删除遇到Windows占用
- **WHEN** 全部产品断言与owned cleanup已通过，但最外层临时测试根删除返回Windows暂态`EPERM`或等价占用错误
- **THEN** verifier MUST记录warning、阶段耗时和保留路径
- **AND** 该harness残留 MUST NOT单独把已通过的产品行为改为failed

#### Scenario: 观察高成本阶段
- **WHEN** release smoke或fresh build成功或失败
- **THEN** timing evidence MUST至少区分准备、安装/构建、启动与状态演进、卸载/最终Doctor以及harness cleanup中的适用阶段
- **AND** 每个阶段的性能预算 MUST保持非阻断

#### Scenario: 候选生命周期必须区分产品清理失败与harness残留遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: 验证 DAG 必须有界调度并保留失败传播
Buildr verification scheduler MUST 只在 step 的全部依赖通过且 concurrency class 有容量时启动该 step，MUST 在当前 ready steps 中优先选择已声明调度成本较高者，并 MUST 保留 passed、failed 与 blocked step 的独立结果。


汇总 MUST分别保留准备、原子检查退出、超时及清理事实。超时与先前真实断言失败同时出现时 MUST同时报告；清理失败可使最终动作失败，但 MUST保留原检查已通过事实且不得将该结果写入复用缓存。

#### Scenario: 独立 steps 并发
- **WHEN** 多个 ready steps 使用允许并发的类别且未超过类别和全局上限
- **THEN** scheduler MUST 优先启动 `schedulingCostMs` 较高且容量可用的 step
- **AND** 相同成本或未声明成本的 steps MUST 保持 plan 中的稳定相对顺序
- **AND** 输出顺序 MUST 按稳定拓扑顺序呈现，不依赖启动或完成先后

#### Scenario: 高成本 step 尚未 ready
- **WHEN** 一个高成本 step 的依赖尚未全部通过，但其他低成本 step 已 ready 且有容量
- **THEN** scheduler MUST 启动容量可用的 ready step
- **AND** scheduler MUST NOT 为等待高成本 step 而空置可用槽位

#### Scenario: 依赖 step 失败
- **WHEN** 一个 step 返回非零状态
- **THEN** scheduler MUST 将直接或传递依赖该 step 的未启动 steps 标记为 blocked
- **AND** 与失败 step 无依赖关系且已经启动的 steps MUST 保留实际结果
- **AND** 整体执行 MUST 返回非零状态

#### Scenario: 对比调度模式
- **WHEN** 维护者在同一冻结 Candidate tree 上选择 cost 或 declaration 调度模式
- **THEN** 两种模式 MUST 使用相同 registry、profile、依赖、并发上限和 executors
- **AND** timing summary MUST 记录实际 `schedulingMode`
- **AND** 未知模式 MUST 在启动 verifier 子进程前 fail closed

#### Scenario: 验证 DAG 必须有界调度并保留失败传播遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验

### Requirement: Publish workflow必须复用matching Candidate artifact
显式dispatch的release workflow MUST从release context声明的successful Candidate run读取`candidate-aggregate`与唯一`candidate-package`，并 MUST在所有Host Node、Launcher、protected transaction与Registry readback前核对source commit/tree、registry identity、artifact manifest、SHA-256、integrity与application payload digest。Publish workflow MUST NOT执行application payload build、`npm pack`或完整Product Candidate。


源码检查的完整覆盖 SHALL 由本次实际执行或相关输入匹配的完整成功结果满足；MUST区分两者并保留原执行来源。该复用不允许删除required owner、推导未测平台或复用不同最终包字节。

#### Scenario: 下载matching Candidate evidence
- **WHEN** dispatch context引用completed successful Candidate run
- **THEN** workflow MUST从该run下载aggregate与artifact并验证aggregate status、source和artifact identity完全匹配context
- **AND** 后续所有consumer MUST使用同一下载目录中的tarball bytes

#### Scenario: Candidate artifact缺失或过期
- **WHEN** aggregate、artifact或任一必需bytes无法从matching Candidate run读取
- **THEN** workflow MUST在公共mutation前失败并要求对current release source形成新的Product Candidate
- **AND** MUST NOT在publish run内构建替代artifact、重新pack或接受其他run的近似bytes

#### Scenario: Protected transaction复核同一bytes
- **WHEN** 唯一protected job准备执行tag或npm mutation
- **THEN** job MUST再次核对context artifact identity与下载tarball bytes
- **AND** 任一不一致 MUST在tag mutation前失败关闭并保留current attempt evidence

#### Scenario: Publish workflow必须复用matching Candidate artifact遵循有效结果复用边界
- **WHEN** 完整计划含已通过且相关输入匹配的源码检查
- **THEN** 运行器 SHALL保留该检查覆盖并明确复用来源，不重复启动其执行或专属准备
- **AND** 输入未知、变化、结果失败或清理不净时 MUST重新取得相应证明；最终包消费仍按原字节核验
