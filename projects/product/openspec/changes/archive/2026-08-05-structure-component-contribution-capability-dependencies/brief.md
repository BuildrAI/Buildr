# Component Contribution 结构化能力依赖

## 一句话摘要

让Component以同一份definition原子拥有Skill fragment及其引入的capability dependency，并统一OpenSpec直接consumer与单一converge事务边界。

## 背景与问题

当前Component只结构化声明Markdown fragment，provider缺失时的停止条件需要另外维护在package builtin或workspace Skill manifest中。Doctor不会从正文推断依赖，因此fragment与graph可能漂移。OpenSpec Component还同时保留旧triage baseline门禁、独立sync/archive入口和新converge事务。

## 目标与非目标

目标是增加向后兼容的`skillDependencies`、确定性runtime合并与Doctor诊断，并修正propose/update/apply/sync/archive路由。非目标是不新增capability contract、dispatcher、Task writer或让Doctor解析Markdown。

## 受影响用户或角色

主要影响维护Buildr Component和使用OpenSpec workflow的Agent；用户获得更早、更准确的provider readiness诊断，且不能通过独立sync/archive绕过确定性收敛。

## 核心流程

Component安装后，runtime同时组合fragment和dependency contribution；Doctor按effective requires诊断。OpenSpec apply在编辑前完成proposal门禁，sync/archive只转交`buildr openspec converge`。

## 关键变化

- Component v1新增结构化Skill dependency contribution。
- OpenSpec依赖authority从package descriptor迁入Component definition。
- apply门禁从triage迁到apply；sync/archive拒绝旁路。
- canonical specs移除旧baseline与pre/post-sync流程。

## 影响、风险与兼容性

新字段可选，旧Component保持兼容。多个来源声明相同dependency时required优先；不存在的contract/provider由现有capability graph诊断。直接CLI仍由自身Application契约负责，不由Skill graph伪保护。

## 验收摘要

Component lifecycle必须同时增删fragment与graph dependency；Doctor必须准确显示OpenSpec consumer required/optional状态；runtime不得从Markdown推断；apply/sync/archive不得保留旧旁路。

## 技术artifacts入口

- `proposal.md`
- `design.md`
- `specs/managed-components/spec.md`
- `specs/skill-capability-contracts/spec.md`
- `specs/agent-task-workflows/spec.md`
- `specs/buildr-package-assets/spec.md`
