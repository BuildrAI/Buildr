## Why

服务列表把声明发现路由的后端强制带入任务泳道（Lane），阻止真实主工作库按原 QA 配置普通启动。应分开普通启动与任务联调，恢复服务列表的直接使用；目标见[任务说明](@task/service-main-start)。

## What Changes

- 单服务普通启动不创建任务泳道（Lane）或路由文件，选择已验证的远程连接环境；允许选择真实已有工作树（Worktree），其任务归属不自动将本次运行变成任务联调。
- 保留既有版本 1 任务泳道（Lane）、任务组合及隔离行为，不引入新路由格式，不修改 Java 路由协议。
- 服务列表选择代码目录、分支（Branch）和远程连接环境，只启动当前服务，不展示逐下游选择。分支无对应工作树（Worktree）时自动创建独立目录，保留原目录与改动；已有对应检出则复用。
- 来源选择复用源代码管理的分支管理组件（Component），绑定所选代码库（Repository）与工作树（Worktree），支持显式安全检出和独立目录使用；启动采用实际检出分支（Branch）。复用读取并预先读取启动配置，后台刷新保留已有展示。
- 合并重复启动入口，收紧验证信息布局，稍微强化列表启动动作；复用个人收藏保存常用服务，优先排序并支持只看常用。
- 开发任务一键启动所选前后端，按本任务实际实例连接；未在本地参与的后端继续使用远程环境，不要求先启动全部下游。
- 前端普通连接使用网关基址及原请求路径，不要求完整后端清单；任务只维护实际需要的本地连接映射。
- 兼容读取旧运行定义及任务路由。私有启动包装器及客户端代理在所属代码库适配，不进入产品资源。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `service-runtime-operations`：分离单服务远程连接与任务本地联调，增加分支（Branch）与独立工作树（Worktree）的启动来源选择。

## Impact

- `projects/product/services/buildr/src/modules/service-runtime/` 的启动、连接及重启检查；现有运行定义和版本 1 路由文件保持。
- `projects/product/services/buildr-web/src/features/service-runtime/` 的默认目录、后端连接展示、前端逐目标选择及配置提示词（Prompt）。
- `projects/product/services/buildr/resources/runtime/skills/buildr/references/local-services.md` 的通用使用指导。
- 私有包装器须支持无路由文件的普通启动并保持准确运行身份、退出隔离及合适就绪检查；私有客户端复用既有多后端声明，远程保留路由路径、本地直连才转换路径。完整业务验证与本机检查分别报告。
