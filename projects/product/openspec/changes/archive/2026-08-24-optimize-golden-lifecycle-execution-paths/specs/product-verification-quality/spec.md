## ADDED Requirements

### Requirement: 黄金生命周期优化必须保留真实主证据并记录分段成本
Buildr Product MUST 仅复用不承担 primary evidence 的只读准备，并 MUST 为每个被优化黄金 owner 保留独立可写 sandbox、至少一条完整真实初始化与生命周期路径，以及 prepare、body、wait、cleanup 的改造前后实测；优化 MUST NOT 缓存被测结果、扩大全局并发、共享可写状态或削弱 Candidate/Release authority。

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
