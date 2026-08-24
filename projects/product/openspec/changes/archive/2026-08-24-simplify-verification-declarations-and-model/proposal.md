## Why

Product 当前把 affected、Core、Candidate、Release、Quick、profile 与测试边界混在同一叙述里。虽然现有 registry 已区分执行边界、路径 ownership 和 profile membership，公开 capability 与文档仍要求用户理解内部 `core` identity，Task Candidate 也容易与发布候选制品混淆。近期三轮 Core 实测约 309–346 秒，继续优化单个黄金路径没有形成稳定收益；在进入下一轮 affected 选择审计前，需要先建立不丢证据、没有第二 authority 的清晰模型。

## What Changes

- 用“证据边界、选择范围、验证对象/决策”三个正交问题定义 Product 验证模型：Static/Unit/Component/Integration/System；affected/full；Task Delivery、Product Artifact Candidate、Published Release。
- 将 `product.delivery` 明确为冻结 Task Content 的正式交付验证，默认选择可信 affected；只有结构化、可解释且 fail-closed 的 authority 原因才升级 daily-full。
- 将 `product.full-regression` 明确为完整日常证据能力。`daily-full` 成为公开名称，既有 `core` profile、`test:core` 与相关 identity 仅作内部兼容投射。
- 将 `product.candidate` 明确为 exact source 与唯一候选制品上的完整日常证据加 artifact evidence；将发布验证明确为 matching Candidate 之后针对真实发布物/结果的 Release-only evidence。
- 将 Quick 限定为开发期低成本反馈，不冒充正式 Task Verification；将 Task Content Target、Task lifecycle Candidate identity 与 Product Artifact Candidate 明确隔离。
- 更新声明、registry contract、兼容入口、规范、当前认知与用户文档；不在本 Change 中收窄 changed-path ownership 或移除 primary evidence。

本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 规定三轴验证模型、公开 capability 的对象/选择/决策语义、daily-full 兼容投射和 Task/Product Candidate 术语隔离。

## Impact

影响 `verification.yml`、Buildr verification profile 入口与契约测试、Product 验证文档、Buildr Service 当前认知和术语表。唯一 registry、ownership mapping、planner、Candidate generation、tarball、Launcher、Release workflow 与正式 Task Verification authority 保持原有职责和覆盖。
