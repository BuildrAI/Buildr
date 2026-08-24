## Why

Product 已把公开验证模型收敛为证据、选择范围和验证对象三个问题，但普通 Task 的 affected 与 Full 升级仍缺少基于真实 Execution Record 的系统审计与逐步可解释性。近期 daily-full 仍实测 427.8 秒；现在需要先确认慢因究竟是选择过宽还是被正确选中的 primary evidence owner 过重，再据实收窄选择或形成“选择不是主要瓶颈”的正式结论。

## What Changes

- 为近期代表性普通 Task 建立 before/after selection audit，统一采集 changed paths、direct owner、selected step、dependency closure、scope mode、Full reason code、step 数、墙钟与重型 owner。
- 让 affected plan 区分 direct selection、owner mapping 与 dependency closure，并为 selected step 输出触发 path、公共结果、执行边界和闭包原因。
- 让每次 Full 升级输出稳定 reason code、触发 path 与用户可理解的 authority 说明；planner、registry、ownership、关键 verification authority 及无法安全判断的高风险输入继续 fail closed Full 或阻断。
- 修正真实审计证明过宽的 ownership/selection 规则；若当前选择已足够窄，则不为数字目标削弱证据，并明确剩余重型 primary owner。
- 固化普通逻辑、Finish、Workspace/Worktree/process、planner/registry/ownership、unknown/unowned、Candidate/Release authority 反例，并记录各 evidence layer 的实际选择粒度。
- 用当前实测重算 Full 升级率、selected step 数、墙钟中位数/P90、Full 原因分布、常见重型 owner、预算、关键路径和容量数学下限。
- 不包含破坏性公共入口变化；既有 fail-closed 与 Candidate/Release authority 保持兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 增加 affected/Full 选择的逐步解释、稳定 Full reason code、真实 Task 审计、fail-closed 反例与实测预算要求。

## Impact

- 影响 `services/buildr/test/verification/changed.mjs`、planner、ownership、registry 的选择投影和相关 contract/integration/system 测试。
- 影响 Product verification framework/current knowledge 中的选择解释、审计结果和预算事实。
- 不改变唯一 Candidate tarball、真实 Release transaction 或 Published Release readback authority；不执行真实外部发布。
