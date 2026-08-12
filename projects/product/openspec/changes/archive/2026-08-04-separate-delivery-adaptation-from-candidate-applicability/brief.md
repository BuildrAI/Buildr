# 分离交付适配与候选适用性

## 一句话摘要

Task Development唯一判断Candidate是否current，Task Finish只在最新Delivery Baseline上形成或保留隔离Delivery Carrier；机械冲突进入Agent-reviewed Delivery Adaptation，不再自动触发Candidate rebuild。

## 背景与问题

当前Development把最新目标头带入Task Contribution观察，Finish又把Git应用冲突统一归为Candidate defect。两者叠加后，同路径目标前进会驱动Agent rebase原Task worktree、使gates真实stale并产生重复Candidate/Verification/Review/handoff。

## 目标

- Development成为Candidate/gates/handoff applicability的唯一authority。
- clean apply确定性复用原Candidate；conflict只保留隔离carrier并要求Agent语义适配。
- 原Task source真实变化才重新Development和增加generation。
- Finish内formal Verification执行数始终为0，普通push/ref回读/retained/cleanup保持完整。

## 非目标

- 不自动解决冲突、rebase原Task worktree、force push或推断语义安全。
- 不新增状态机、CAS、历史/Verification store、第二Candidate或额外生命周期页签。
- 不修改已归档Change和既有generation/run历史。

## 受影响用户或角色

- Agent：在run-owned Delivery Carrier处理语义兼容，无法判断时保持blocked。
- Project：既有verification policy决定适用的bounded carrier compatibility checks。
- Buildr：只记录确定性Git、identity、check、remote与cleanup facts。

## 核心流程

1. Development只读inspect原Task source/context/policy/gates；未变则全部current。
2. Finish prepare在最新baseline clean apply时走`deterministic-reuse`。
3. conflict时保留carrier，返回`delivery-adaptation-required`与exact resume token。
4. Agent仅编辑并提交隔离carrier；Buildr核验确定性facts和compatibility evidence。
5. 恢复Finish后以`agent-reviewed-delivery-adaptation`交付；source真实漂移才回Development rebuild。

## 关键变化

- 删除Finish conflict直接宣称Candidate defect/stale的重复路径。
- Delivery Baseline不再参与Development Content Target observation。
- Finish Result新增明确reuse mode和交付适配恢复事实。

## 影响、风险与兼容性

Agent-reviewed carrier不等于Buildr证明语义正确，因此必须明确结果措辞并按existing policy执行compatibility checks。旧terminal Finish run不迁移；CLI仍只有`run|inspect`，五阶段主线不变。

## 验收摘要

真实测试证明clean reuse与same-path adaptation均不增加generation、不重跑formal Verification；真实source drift才rebuild；无法证明时不push、不cleanup；远端ref、retained Doctor与双环境cleanup有证据。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/agent-task-workflows/spec.md`
- `specs/task-finish-execution/spec.md`
- `specs/cli-product-surface/spec.md`
- `tasks.md`
