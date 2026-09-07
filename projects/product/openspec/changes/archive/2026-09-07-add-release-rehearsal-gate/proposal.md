## Why

当前只有正式发布集合（Release Selection）冻结后，才会在 GitHub 的干净 macOS、Windows、宿主 Node 与独立作业环境中执行完整候选版验证。这使环境闭包和跨作业准备缺口直到发布阶段才暴露，导致发布集合被反复重新打开并边发布边修。

## What Changes

- 新增发布演练（Release Rehearsal）：在正式选择提交前，针对“当前冻结发布树 + 有序待选提交”构造临时预期发布树，并运行与最终候选版相同的唯一产物和全部平台分片。
- 发布演练保持 `fail-fast: false`，在依赖允许的范围内一次收集全部失败；失败只回到同一支持任务修复，不改变正式发布集合。
- 只有与预期发布树精确匹配的发布演练全绿后，正式发布集合才允许重新打开并纳入对应提交；正式选择产生的树必须与演练树一致。
- 将依赖安装、DTO、测试上下文和 `web-dist` 收敛为统一的候选环境准备（Candidate Environment Preparation）入口；作业只声明准备档位，不再自行拼装命令。
- 最终候选版验证继续绑定正式冻结发布源与唯一产物，用于确认演练结果未因选择、主分支覆盖或远端漂移失效；不承担首次发现可预见环境问题的职责。
- 不改变公开发布授权、npm、标签或 GitHub Release 的安全边界；不包含破坏性变更。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `release-collection-model`: 定义预期发布树、演练资源与结果身份，并为正式发布集合增加匹配全绿发布演练的原子提升门禁。
- `product-verification-quality`: 发布演练与最终候选版复用同一验证注册表、唯一产物拓扑、平台分片和集中环境准备入口。
- `open-source-release-governance`: 候选准备流程先完成无公开副作用的完整发布演练，再执行一次正式提升和最终候选确认。

## Impact

- 影响 `.github/workflows/verify.yml`、候选验证入口、发布选择/编排工具、发布 Skill 与发布检查清单。
- 需要新增预期发布树与演练结果的闭合身份模型，并让正式选择消费该结果。
- 需要更新发布流程、Buildr Service 技术说明与术语表。
- 不增加生产依赖，不改变 npm 包格式或公开发布事务。
