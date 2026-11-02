## Why

使用 Buildr 不应使用户项目自动接受 Buildr 的产品哲学、沟通偏好和交付授权约定。当前初始化及同步强制写入根 `AGENTS.md`，诊断又要求恢复，妨碍用户独立维护规则。

## What Changes

- **BREAKING**：初始化、更新与同步不再创建、插入、替换或修复根 `AGENTS.md` 的默认规则区块。
- 不因文件或旧区块缺失、变更而产生恢复警告。现有文件（含旧区块）逐字保留，不批量清理。
- 继续按实际存在的 `AGENTS.md` 发现和投射规则；没有根规则文件也可使用 Buildr。
- 精确匹配的旧区块保留只读来源识别；普通自有规则不因缺少旧区块被判为冲突。
- 调整随包维护指引及相关检查。Things 的自有约定单独维护，不成为 Buildr 默认内容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `root-organization-workspace`：根规则文件由用户维护，不再自动注入。
- `workspace-first-runtime-projection`：发现现有规则，不要求根默认区块。
- `buildr-package-assets`：取消通用必装核心规则，保留历史来源兼容。
- `agent-readable-doctor`：取消默认区块的必需性诊断。
- `buildr-product-capability-sync`：同步保留规则原文，不恢复默认段。
- `product-agent-skills`：维护指引与新的所有权边界一致。

## Impact

涉及 Workspace 初始化、Agent Assets 同步与诊断、旧规则来源识别、随包技能指引、相关知识说明及测试。无需数据库迁移，不自动修改现有工作空间，也不发布或激活运行环境。
