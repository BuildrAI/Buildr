## Why

Buildr 已分别具备任务环境、独立 Local App 预览、跨任务验证资源协调和集成后主工作区收敛，但缺少把这些能力组合起来的可重复整体验收。若只靠人工分批观察，后续修改可能在各自测试通过时仍引入跨任务入口、资源、目标分支或清理串扰。

## What Changes

- 新增双任务并发整体验收，使用两个真实 task environment 贯穿 CLI 调用、Local App 预览、验证资源协调、目标分支竞态诊断和归属清理。
- 把整体验收登记为 Product Candidate 的独立验证步骤，并输出任务身份、端口、资源等待、竞态和清理证据。
- 验收完全使用临时 Workspace 与本地 Git 远端，不修改开发者保留工作区、默认 Local App 或外部系统。
- 无破坏性变更。

## Capabilities

### New Capabilities

- `concurrent-task-acceptance`: 定义两个任务并发开发与验证的组合验收、结构化证据和隔离边界，确保入口、预览、共享验证资源、目标分支竞态及清理在同一场景中可重复核验。

### Modified Capabilities

- `product-verification-quality`: 将双任务并发整体验收登记为完整 Candidate 的 required step。

## Impact

- `services/buildr/test/`：新增并发任务整体验收及其辅助夹具。
- `services/buildr/test/verification/registry.mjs`：登记 Candidate 验证步骤。
- Product OpenSpec：新增组合验收能力，并更新验证质量契约。
