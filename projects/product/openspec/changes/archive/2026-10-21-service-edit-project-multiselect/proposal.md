## Why

服务（Service）与项目（Project）是多对多关系，但服务编辑抽屉的“所属项目”仍是单选：编辑已被多个项目共享的服务时只显示第一个项目，用户改选或清空后会按全量语义把归属收缩为一个或零个，静默移除其他项目的引用。这使多项目共享无法可靠地从服务侧维护，也与既有关系模型不一致。

## What Changes

- 服务编辑抽屉的“所属项目”改为多选，打开时显示全部当前归属项目。
- 保存时按全量语义提交所选项目集合；新增归属会把服务加入对应项目，取消某个项目只解除该项目的引用，不影响其他项目。
- 保留新增服务流程现有的“所属项目”单选设计，不改变服务与代码库的多对一关系。
- 同步更新服务编辑交互规格，并补充多项目归属的测试覆盖。

无破坏性变更（Breaking Change）；清单结构、接口字段和后端全量语义保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-asset-management-interactions`: 服务编辑抽屉的“所属项目”由单选改为多选，并要求完整展示和按全量语义维护多项目归属。

## Impact

- 前端：`projects/product/services/buildr-web` 的服务编辑抽屉及相关测试。
- 规格：`workspace-asset-management-interactions`。
- 后端与数据：复用现有 `projectIds` 全量语义和项目 `serviceIds` 引用，不修改清单结构或 API 契约。
