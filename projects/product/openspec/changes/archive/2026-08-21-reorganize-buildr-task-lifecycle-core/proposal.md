## Why

Task Environment、Development、Verification、Execution Record、Planning Identity、Entry Snapshot、Overview 与 Parent Coordination 共同维护 Task current facts、专业 Receipt/Result 和父子协调，但实现仍分散在全局 Domain/Application/Interfaces 与 Bootstrap 兼容组装中。Task Record、Review、Retrospective 参考切片和 TypeScript 执行基础已经交付，现在可以把这组依赖紧密的核心编排一次收敛到 `task` 模块，减少重复入口和后续 Finish 迁移冲突。

## What Changes

- 将上述 Task 生命周期核心的 Domain、Application、业务 Persistence、CLI、HTTP 与 Internal Interfaces 迁入 `src/task` 对应技术层，技术层内保持 flat-first。
- 扩展 `src/task/module.mjs`，以窄 capability ports 和 CLI/HTTP/internal contributions 显式装配各专业 Application；Bootstrap、CLI Host 与 HTTP Host 不再直接导入或注册其内部实现。
- 清理全局 `src/domain`、`src/application`、`src/interfaces` 和 `src/task/persistence` 子目录中的旧入口，确保每项专业事实只有一套 Repository/Application writer 与 read model。
- 同步更新 imports、Application Payload、Verification owner、架构检查和相关 unit/integration/system/contract tests。
- 更新 Buildr 服务架构文档，记录 Task 生命周期核心的实际迁移状态，并明确 Task Finish、Terminal Delivery、Delivery Carrier、Activation、Cleanup 与 Finish recovery 仍留待后续独立迁移。
- 保持公开 CLI、HTTP、JSON、SQLite schema、migration/checksum、Receipt/Result schema、状态流、事务、锁、幂等、原子性和 writer authority 不变。
- 已迁移的 Task Record、Review、Retrospective 保持其当前模块边界，不重新实现或合并。
- 本变更不包含破坏性变更。

## Capabilities

### New Capabilities

- `task-lifecycle-core-module-architecture`: 定义 Task 生命周期核心编排在 `task` 模块中的技术分层、窄模块入口、唯一装配、Host contribution 与 Finish 排除边界。

### Modified Capabilities

无。既有 Task Environment、Development、Verification、Execution Record、Planning Identity、Entry Snapshot、Overview、Parent Coordination 及公开 CLI/HTTP/JSON 行为要求保持不变。

## Impact

- 影响 `projects/product/services/buildr/src/task`、上述能力的旧全局实现路径、Bootstrap/CLI/HTTP/internal 组装、Application Payload inventory、Verification owner 与相关测试。
- 不新增运行时依赖，不修改 SQLite migration，不修改 sibling `buildr-web`、React/Vite 源码、`web-dist` 构建或正式发布 authority。
- Task Finish 与交付副作用继续由现有实现持有，本 Change 只允许为保持 imports/ports 可用而做必要的 consumer 调整。
