## Why

Buildr 主程序当前直接持有智能体服务（Agent Service），开发更新或主程序退出会关闭原生连接和模型转接，打断已受理工作。现在将执行能力独立运行，并以可替换宿主（Host）的契约（Contract）划分边界，可以解决眼前中断，也避免将来建设独立 Buildr Agent 产品时再次从 Buildr 业务模块中大面积拆出核心。

## What Changes

- 在每个应用配置域（Profile）中按需运行一个本机独立执行后台，持有现有对话、交接、执行控制、账号、模型转接、待回应和私有交互数据；Buildr 重启仅断开和重建客户端连接。
- 明确执行操作、宿主能力、运行管理三组版本化契约（Contract）；公共声明、客户端（Client）及独立承载可随 `buildr-agent` 复用，Buildr 通过自身接入实现提供登记解析、对象核验、网页认证和产品装配。
- 将当前 `resolveWorkspace`、`assertTask` 的语义收敛为执行环境及可选外部工作对象核验。依赖允许指向宿主提供的契约，不允许指向 Buildr 内部模块、数据表或必须持续在线的网页请求。
- 新版先准备为独立且受保留的运行单元，活动后台继续工作；确认空闲后短暂暂停接收新工作、正常释放、启动新版并重新连接。每个配置域只允许一个活动数据写入者，不增加跨版本执行迁移或持久发送队列。
- 保留现有页面与任务（Task）入口、模型组合和授权策略、交接行为、活动及已读信息。单次生成继续由业务持有短期请求及结果应用，模型调用通过执行操作契约接入。
- **BREAKING**：替换现行规范要求的同进程装配与主程序退出时关闭执行的内部约定；浏览器地址、历史身份、账号配置和业务操作保持兼容，不要求用户另装服务、手动配端口或再次配置账号。
- 本轮按已确认方案实施进程独立化。独立产品发行、移动端、远程执行、开机启动、长期记忆、自动换套餐、自研推理循环和新旧版本并行执行均不在范围内。

## Capabilities

### New Capabilities

- `agent-execution-process`：三组公共契约、独立承载和连接、单活动后台、受保留运行单元、空闲切换、数据维护边界，以及无 Buildr 模块的宿主可替换验收。

### Modified Capabilities

- `agent-runtime-connections`：修改“智能体服务必须独立维护并随现有宿主交付”和“原生进程必须按拥有关系和真实存活状态管理”，区分 Buildr 接入主程序与执行后台生命周期，保留原生退出和未知不重发约束。

## Impact

- `services/buildr-agent/`：公共契约与数据声明、通用客户端、可直接承载核心的进程入口、运行管理及已有核心中的宿主调用点；保持私有包、现有厂家适配及唯一凭据责任。
- `services/buildr/src/modules/agent-service/`、`src/bootstrap/runtime.ts`：由直接装配和关闭核心转为连接后台、实现宿主契约及网页适配；内部任务与工作空间模块继续由 Buildr 自己使用。
- `services/buildr/src/modules/code/`：统一模型调用的跨进程取消和结果转换，不迁移提交说明业务状态。
- Buildr 开发准备、打包、安装身份、预览停止和连接沿用：保留活动运行单元，避免旁路改写活动私有数据，预览停止须包含其拥有的执行后台；继续使用现有唯一自举执行器，不另建安装或同步通道。
- `services/buildr-web/`：复用现有页面及服务端事件流（SSE），调整重新连接、兼容性和待更新反馈；不重新设计界面。
- 当前知识（Current Knowledge）：实施后按最终事实校准 `knowledge/docs/architecture/agent-integration.md`、`agent-boundaries.md`、`agent-integration-generation.md`、`technical.md`、`knowledge/code-map/technical-layers.md` 及准确受影响的运行输入说明；本轮不把未来方案写成当前行为。
- 已同步 `dev` 的 `conversation-activity` 最新交付，保留其活动、排序、统计、已读、标题和全空间查询语义。
