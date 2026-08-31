## Why

工作空间（Workspace）入口目前要求再次读取独立核心规则，增加上下文加载成本并留下双入口维护负担。用户已确认将核心约束与六条智能体优先原则合并到随包入口的受管区块，保留专业规则按需读取。

## What Changes

- 在随包 `AGENTS.md` 受管区块维护唯一核心规则源，去重纳入六条智能体优先原则。
- **BREAKING**：退役 `buildr-core` 专属登记、必读引用和独立文件；已修改或归属不明的遗留文件保留并诊断。
- 初始化、同步、更新、诊断、打包和现有渲染消费者共同采用内联区块；完整保留区块外用户内容。
- 保留通用规则的登记、启停、按需读取、引用及现有适配器能力。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-package-assets`：唯一内联规则源及交付边界。
- `buildr-product-capability-sync`：核心规则安全退役与同步行为。
- `workspace-first-runtime-projection`：入口内联规则与专业规则发现。
- `root-organization-workspace`：初始化和升级后的入口。

## Impact

修改产品规范、随包资源、文件系统区块处理、资产同步、诊断及相关测试。只支持从工作空间启动的现有用法，不新增跨仓入口继承、适配能力、迁移命令或全局门禁。不手改规范工作空间的受管副本；远端交付与自举激活按单独取得的收尾授权执行，不发布版本。
