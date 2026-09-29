## Why

正式发布分支（Release Branch）在产品成功发布后持续累积，标签（Tag）与主线已能保存版本历史，但现有恢复逻辑仍硬性要求发布分支存在。此次统一清理政策与恢复实现，使后续发布收尾能够自动减少临时引用。

## What Changes

- 新发布在明确授权时同时绑定本轮分支清理政策；产品回读成功、官方标签及主线证明源码已保全后，清理本次正式发布分支与既有临时载体。
- 分支删除后允许重复收尾及失败恢复；引用漂移、标签缺失、源码未保全时保留现场。
- 保留官方远端标签、GitHub Release、npm 版本和发布证据；旧发布授权缺少新政策时不扩大为删除授权。
- 同步技能（Skill）与唯一发布流程正文。本次不删除真实远端分支、不执行公开发布。
- 不引入包或用户数据的破坏性变更；新政策改变未来发布的远端分支保留行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `open-source-release-governance`: 发布后按授权政策安全清理并在分支缺失时恢复。
- `release-collection-model`: 区分持久版本引用与本轮临时分支，保留旧授权的解释。
- `agent-task-workflows`: 技能展示本轮清理范围并消费对应执行结果。

## Impact

修改发布编排、Git 收敛与生命周期实现及其现有测试；维护 `skills/buildr-release/SKILL.md` 和 `knowledge/docs/flows/open-source-release.md`。不新增依赖、接口、全局清理流程或第二份发布状态库。
