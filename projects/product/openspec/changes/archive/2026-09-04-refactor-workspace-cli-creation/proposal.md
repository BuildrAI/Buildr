## Why

`workspace/interfaces/cli/workspace.ts` 已增长到729行，同时承担Workspace/Project/Service参数解析、YAML兼容读写、Git探测、文件复制、Manifest mutation和终端输出。它绕过已建立的Project/Service Application与Repository边界，使同一业务写入存在CLI专用实现，后续修改难以保证HTTP、CLI和领域规则一致。

## What Changes

- 按Workspace、Project、Service三个独立领域拆分CLI Adapter；每个Adapter只解析参数、调用Application并输出结果。
- 将Project/Service创建、attach、clone/copy、Git身份检查、Registry更新和Gitignore边界分别迁入`project-creation-application.ts`和`service-creation-application.ts`；原有Application体量合理，不机械拆Query/Command。
- 将legacy Manifest兼容解析、序列化和revision细节归还对应Repository，不在CLI保存第二套YAML实现。
- Workspace初始化和mutation recovery继续由现有Workspace operations边界负责，本切片只为其提供独立Workspace CLI Adapter。
- 保持公开命令、参数、help、输出、错误、Manifest/YAML、Git副作用、原子mutation和declaration-intake next action不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-source-layout`: 明确Workspace、Project、Service CLI Adapter必须按领域独立，并只能调用所属Application；Manifest/Git业务实现不得留在Interface。
- `workspace-control-plane-module-architecture`: 明确Project/Service创建用例及CLI贡献的owner和行为等价边界。

## Impact

- `services/buildr/src/workspace/interfaces/cli/**`
- Workspace、Project、Service Application与Manifest Repository
- `workspace/module.ts` CLI contributions及相关架构、CLI、Workspace生命周期测试
- 不涉及公开协议、持久化格式、前端页面或数据库迁移。
