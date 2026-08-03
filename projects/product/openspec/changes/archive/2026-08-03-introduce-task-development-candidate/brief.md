# 引入Task Development与Task Candidate

## 一句话摘要

建立Task Development单一authority，让formal Verification先绑定稳定Content Target，再冻结不含Result identity的Candidate/generation，完成Completion Review与风险决策后交给窄Task Finish adapter交付。

## 背景与问题

P0.1—P0.4已经分别交付Task Record、Environment、Review Result和Verification Result，但Development尚无Receipt/Application。当前Task Finish仍负责Change收敛、内容修改、Candidate冻结和formal Verification，Verification文档也仍把target描述为Candidate，造成权威顺序倒置和Finish过宽。

P0.5需要把内容开发与交付适配之间的边界补齐：验证对象是尚未冻结Candidate的stable Content Target；Candidate只绑定内容、Task context、policy和generation；Completion Review绑定Candidate；Finish只消费Development handoff并证明carrier内容等价。

## 目标与非目标

目标是交付closed Development Receipt、唯一Application、通用Content Target observation、verification policy decision、Candidate/generation、gate applicability、scoped risk与Finish handoff；一次性迁移Verification和Finish消费者，支持0..N Change及无Git/无OpenSpec code-only Workspace。

非目标是不增加公共Development CLI、Local App投影、Task Core、数据库/事件总线/通用状态机、history/revision/CAS/锁、新测试框架或P0.6—P0.8架构。

## 受影响用户或角色

- 在正式Task中实现、验证、审查并准备交付候选的Agent与维护者。
- 提供Task scope/execution roots的Task Environment，以及维护Planning/Completion current Result的Task Review。
- 只维护Content Target事实与declaration applicability的Task Verification。
- 只执行carrier、delivery、retained convergence与cleanup的Task Finish。
- 使用自有Project/Service代码、verification.yml、可能没有Git或OpenSpec的普通Workspace用户。

## 核心流程

正式Task取得ready Environment并完成Planning Review。Development收敛适用Change/current knowledge/生成资产，观察完整stable Content Target并记录verification policy。Task Verification针对该target形成target/declarations current且policy facts完整的Result后，Development冻结Candidate/generation；`not-passed`或coverage gap不被freeze改写，留给后续风险决定。Task Review再以Candidate identity执行Completion Review。Development形成proceed/blocked与scoped risk；正向gate可直接handoff，负向Verification/Completion gate必须有绑定精确Result digest和范围的用户风险接受。Finish可机械提交delivery carrier，但必须通过Development证明内容逐component等价，随后才可push、retained sync/install/doctor和cleanup。

任何内容、Task context、policy/declaration或gate变化都会使current Candidate/handoff失效；已正式写入的旧handoff snapshot保持不可变。修复、rebase、sync或重新验证返回Development，不在Finish中吸收。

## 关键变化

- 新增`buildr.task-development-receipt/v1`、Development Domain/Application/repository/content observer与`buildr.task-development@1` Skill contract。
- Candidate identity只绑定Content Target、Task context、policy与generation，不包含Review/Verification Result identity。
- Verification Result v1字段保持最小closed schema，但target语义切换为stable Content Target；Finish不再读取或补齐Result。
- Finish保留当前五阶段执行壳以避免提前进入P0.8，其中verify只核验handoff/carrier等价，formal Verification次数固定为0。
- Change convergence/archive、current knowledge/runtime content fixed point在Content Target前完成；Finish删除相应mutation与Candidate writer路径。
- 无公共Development CLI/Local App；bundled Skill通过内部driver调用同一Application。

## 影响、风险与兼容性

这是一次authority单切换：新Development Receipt没有旧schema迁移；依赖旧Finish-owned Candidate/Verification语义的未完成run会fail closed。现有Task Record、Environment、Review与Verification Result stores保持各自schema和writer；终态/历史专业记录不复制进Development。

主要风险是Content Target inventory成本和carrier等价误判。实现通过registered source observer与portable filesystem fallback、只保存component digest，并以非Git fixture和Buildr full Candidate双重证明。任何不能证明等价的变化都返回Development，不使用兼容双轨。

## 验收摘要

- Unit证明identity graph、closed schema、generation幂等与漂移失效。
- Component/Integration证明Development是唯一Receipt reader/writer且只通过Review/Verification Applications消费sibling facts。
- 非Product/Service、无Git/无OpenSpec fixture完整走通Development→Verification→Candidate→Completion Review→Finish adapter。
- Finish不执行formal Verification、不冻结Candidate、不收敛Change，carrier变更内容时fail closed。
- Buildr自举先在stable Content Target运行required/full验证，再由新Development生成Candidate/handoff并完成retained delivery/doctor/cleanup。

## 技术artifacts入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
