## Why

Buildr 日常 Core 当前干净基线中位数约为 267.561 秒，但现有结果还不能回答主要成本来自 affected 选择放大，还是来自被正确选中的单个黄金 owner。registry 已记录 owner、边界、预算与 primary evidence owner，却缺少可复核的跨层证据地图和代表性普通变更选择审计，因此低成本层已经充分证明的公共事实仍可能由多个 Integration/System owner 重复主证，维护者也难以区分合理的 Full 升级与过宽 ownership。

## What Changes

- 从唯一 verification registry 派生日常 Core 慢 Integration/System owner 的 primary evidence map，明确每个 owner 的待证明事实、公共可观察结果、证据角色、唯一 primary evidence owner、反例与保留的真实边界。
- 为近期代表性普通变更形成 changed/affected 选择审计，分别报告 changed paths、直接 ownership、依赖扩张、最终 step 数和 Full 升级 reason code，从而量化 selection amplification 与 owner execution cost。
- 只有在低成本 owner 能以反例证明同一公共事实、且 Candidate 文件并集与唯一 ownership 不退化时，才收窄路径 ownership、Core membership 或重型 owner 的证据责任；不可替代的 CLI、Git、进程与完整生命周期仍由真实黄金 owner 主证。
- 将 tarball、安装、Launcher、发布 smoke、registry/readback 等 Release-only 能力设为日常 Core 的闭合排除集合，并以 contract test 证明 Candidate/Release authority 与覆盖保持不变。
- 输出仍需真实执行的 Finish、Workspace、Worktree、Candidate 和进程黄金 owner 清单、当前分阶段基线与新的数学下限，作为后续执行路径优化的输入；本 Change 不预设 Core 必须达到某个墙钟数字。

## Capabilities

### Modified Capabilities

- `product-verification-quality`: 增加可审计的跨层 primary evidence map、代表性 changed selection 审计、Release-only Core 排除闭合验证，以及后续黄金路径优化所需的残余 owner 基线。

## Impact

- 影响 `product/buildr` 的 verification registry、changed planner、contract tests、审计工具与验证框架文档。
- 可能收窄经反例证明为过宽的 ownership 或日常 Core membership，但不修改唯一 Candidate、tarball、Launcher 或 Release authority。
- 不新增 Test Context Runtime，不共享可写 Workspace/Git worktree/SQLite connection/profile/进程状态，不通过缓存被测结果或扩大并发换取速度。
- 无外部 API 或持久数据兼容性变化。
