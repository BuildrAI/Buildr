## Why

全面审查发现，前端逻辑测试（Unit Test）虽已声明却未进入自动候选集合，主包候选也没有真实浏览器验收（Browser Verification）；`main` 的候选检查（Candidate Gate）还可能因来源条件跳过而显示成功。继续扩展用户范围前，需要使交付检查与实际证明范围一致。

## What Changes

- 所有面向 `main` 的合并请求（Pull Request）实际执行候选检查（Candidate Gate），保留已支持来源和精确提交证据校验，不支持来源明确失败。
- 前端逻辑测试（Unit Test）作为独立源码证据进入受影响选择与完整候选集合；DSH 完整验证进入自身受影响选择，保持独立包边界。
- 新增候选压缩包（Candidate Tarball）的核心浏览器验收（Browser Verification）：消费同一压缩包内的 `web-dist`，不重新构建源码网页。
- 校准旧浏览器成熟度及产物准备规范，明确源码验收与候选产物验收的不同输入；保留页面选择、状态隔离和清理要求。
- 更新相应测试声明、解释文档（Explanatory Documentation）及代码地图（Code Map），增加选择与证据聚合回归检查（Regression Check）。

无用户数据结构、公开命令或安装协议的破坏性变更（Breaking Change）。缺少新增必需证据的旧候选结果不能证明新集合已通过。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`：完整候选集合明确包含真实前端逻辑与唯一候选产物的核心浏览器证据；独立插件验证保持自身所有权。
- `buildr-web-browser-verification`：浏览器验收（Browser Verification）按源码或候选产物准备输入，成熟度由明确验证声明决定。

## Impact

涉及 `.github/workflows/verify.yml`、`projects/product/services/buildr/test/verification/`、候选环境准备及发布证据消费工具，已有工作台浏览器断言的校准，以及 `projects/product/verification.yml`、当前知识（Current Knowledge）中对应解释。复用锁定依赖、现有浏览器核心选择器（Selector）和产物身份校验，不增加另一份候选压缩包或通用许可状态。
