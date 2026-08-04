# 强化 Buildr Quick 测试准入门禁

## 一句话摘要

让 Buildr 依据显式环境足迹与重置负担判断 Component 和 Quick 准入，阻止真实环境测试因名称或暂时较快进入低成本门禁。

## 背景与问题

当前 registry 已记录测试分类与目标耗时，但 `contract` 和 `runtime-adapter-contract` 仍包含真实 CLI、Git、临时 filesystem/Workspace 或重复 cleanup。Planner 无法从现有字段自动拒绝这类错误分层。

## 目标与非目标

- 目标：补充最小环境事实、自动拒绝非法准入、迁出当前真实环境 contract，并保留静态契约 Quick 反馈。
- 非目标：不改 `verification.yml` schema，不让 Task Verification 接管分层，不建设通用调度器或测试平台。

## 受影响角色

主要影响维护 Buildr 测试 registry 与新增测试的 Agent/开发者；用户 Project 的 Verification declaration 与 Result 不变。

## 核心流程

新增或修改 registry step 时先声明真实环境足迹、隔离方式和重置负担；planner 在启动 verifier 前检查 Component/Quick 资格；真实环境测试由 changed/affected、focus 与 Candidate 选择。

## 关键变化

- 每个 step 增加闭合、可校验的环境与 reset facts。
- Component 和 Quick 违反边界时 fail closed。
- 静态 Contract 保留 Quick，真实环境 Contract 与 runtime 投射契约迁出 Quick。

## 影响、风险与兼容性

现有 fast/changed/focus/candidate 命令保持不变；退出 Quick 的测试不删除，继续保留 affected 与完整 Candidate 覆盖。Quick 反馈范围变窄但分类事实更可信。

## 验收摘要

Registry/planner contract 已拒绝非法 Component、重复重置 Quick 和不满足例外条件的 Quick Integration。迁出真实环境测试后，三轮 Quick 墙钟为 2.22s、1.84s、1.91s；六个保留 step 都无 step-owned 初始化或 cleanup，完整边界与 timing 记录在 `docs/verification-ownership.md`。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/product-verification-quality/spec.md)
- [Tasks](tasks.md)
