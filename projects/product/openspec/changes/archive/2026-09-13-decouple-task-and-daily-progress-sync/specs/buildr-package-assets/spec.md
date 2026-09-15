## REMOVED Requirements

### Requirement: Package 必须验证创建前 dev 基线收敛工作流
**Reason**: 用户已确认移除强制同步前置，旧成功和失败条件整体由下方独立动作要求替代。
**Migration**: 保留现有记录与 Git 现场；只有实际目标需要代码更新时才独立调用已选 Git 提供者。

## ADDED Requirements

### Requirement: Package 必须验证任务登记与 Git 更新分离
Buildr package verification MUST 覆盖任务登记不依赖 Git 更新及全局诊断，且 MUST 验证 source、package manifest、能力依赖与运行时投射一致。验证 MUST 保留实际 Git 写入的授权、对象、引用与内容保护，不将记录成功当作代码可安全修改的证明。

#### Scenario: 随包技能与能力依赖一致
- **WHEN** Buildr 验证 task-triage 与 Git Operations 声明
- **THEN** Git Operations MUST 保持 optional，只在确实需要 Git 操作时被使用
- **AND** 任务登记 MUST NOT 把它提升为 required

#### Scenario: Git 条件不完整仍可登记
- **WHEN** 隔离样例包含无上游、未提交内容或不可用 Git 提供者，且记录输入合法
- **THEN** verification MUST 证明 Task Record create 或 activate 成功且 Git 内容与引用未被修改

#### Scenario: 独立 Git 操作仍受保护
- **WHEN** 用户目标需要实际 Git 写入
- **THEN** verification MUST 保持 Git Operations 的独立操作、范围保护和部分失败报告，不以任务登记授权替代 Git 写入授权

#### Scenario: 专业职责保持分离
- **WHEN** verifier 检查 Task Record、Buildr Web 和 Worktree
- **THEN** 它们 MUST 不新增创建任务前的 Git 编排或统一就绪状态
