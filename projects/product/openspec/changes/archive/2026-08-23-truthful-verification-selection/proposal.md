## Why

Product changed verification 已经把中央 `registry.mjs`、全部 timing 资产和多类声明文件视为无条件 Full 输入，并在 unknown path 或 production owner gap 时用完整 Candidate 回退。结果是普通 ownership 维护频繁触发 6–9 分钟验证，同时 Full 通过仍不能证明未知路径存在 owner；此外 Candidate 声明的 120 秒预算低于当前 step 目标耗时在容量约束下的理论下限，计划在执行前却无法揭示该矛盾。

## What Changes

- 将路径 ownership mapping 与 Candidate execution graph 拆成不同 authority，使 owner 增删或重命名能够按真实 owner 选择 affected，而执行图、依赖、资源、profile、scheduler 和执行边界变化继续进入 Full。
- **BREAKING**：unknown path 与 direct production owner gap 不再扩展为 Full，而是在任何 verifier 启动前返回 closed diagnostic；需要继续必须由上层正式 Development 风险决定显式授权，planner 不自行接受风险。
- 对 `registry` ownership、timing/report、`verification.yml` 元数据和 package metadata 建立可验证的语义分类，保留执行基础变化的 Full 保护。
- 让计划稳定输出 scope reason、step 数、预计总工作量、依赖关键路径、资源容量下限和总预算可行性；理论下限超过声明预算时执行前失败关闭。
- 通过代表性反例和历史路径样本证明 owner-only 变化走 affected、执行语义变化走 Full、owner gap 不产生 passed plan。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`：细化 changed Full 触发 authority、owner gap 失败语义以及计划预算准入和诊断输出。

## Impact

- 主要影响 `services/buildr/test/verification/` 中的 registry、ownership mapping、planner、changed runner、plan runner、timing budget 与相应 Unit/System/Contract 测试。
- 影响 `test:changed --plan/--json` 的失败语义和计划 JSON/人类诊断，但不扩展通用 Task Verification schema。
- 不在本 Change 重构 Task/Workspace lifecycle fixture，也不改变 Candidate/Release artifact producer、正式 Release workflow 或 primary evidence owner。
