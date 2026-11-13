## Why

模型设置中的“添加自定义供应商”只能新建自定义端点；添加抽屉由前端写死 ChatGPT API、DeepSeek API 与“其他自定义供应商”三项，Claude API、Codex 订阅登录、Devin、DeepSeek、Qoder CN 等内置来源没有统一入口，也无法区分已经接入的来源。供应商卡片只提供“停用/断开”，断开后本机登录凭据和 API Key 仍然保留，用户无法从模型设置真正删除一个供应商。

## What Changes

- 界面实体统一为“添加供应商”和“自定义供应商”，移除“添加自定义供应商”“其他自定义供应商”文案。
- “添加供应商”列表改由 Agent Service 的供应商声明驱动，覆盖全部内置供应商，包括订阅账号登录来源；已接入的供应商显示已接入状态，由智能体接入托管登录的来源标明归属。
- 新增删除模型供应商的能力：拥有独立本机凭据的内置供应商、linked 账号和自定义供应商可以删除；删除前显示将清理的登录凭据、API Key、模型列表与偏好并要求确认。
- 删除会撤销该账号的租约、关闭运行时、移除账号元数据与偏好，并清理账号私有凭据目录；存在进行中模型请求时拒绝删除。
- 删除确认前统计仍以该供应商作为当前模型来源的对话数量；删除不删除对话，成功后引导这些对话重新选择模型。
- 由智能体连接托管登录的 ChatGPT、Qoder、DSH 账号仍由“智能体”页维护，模型页不执行会破坏智能体登录的删除，并提供确认后的“退出登录”断开对应连接。
- linked 供应商删除后抑制自动重建，直到用户再次通过“添加供应商”明确接入。
- 读取旧账号存储时收敛单账号内置供应商的历史重复账号，清理失效重复项及其私有凭据目录。
- 供应商侧栏支持搜索与按订阅账号、API Key、自定义供应商、智能体接入分组。
- 不改变模型调用、协议转换、额度观察与既有模型选择语义；删除与收敛只涉及本机供应商元数据和凭据。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `model-provider-api-access`：新增供应商添加目录必须由供应商声明驱动并覆盖全部内置来源；新增删除供应商的凭据清理、确认、租约撤销和托管来源边界。
- `custom-model-providers`：自定义供应商生命周期补充删除，并要求删除时清理本机密钥、模型列表与启用偏好。
- `unified-model-subscriptions`：补充独立订阅登录来源的删除能力与智能体托管来源的管理边界。
- `shared-native-model-accounts`：明确共享原生登录在模型设置删除时必须清理唯一登录来源，智能体连接随之为未登录。

## Impact

- **buildr-agent**：`model-access/contracts.ts`、`model-access/application.ts`、供应商视图 schema、账号存储中的 linked 供应商抑制标记、单账号重复数据收敛、引用统计读取、删除与再添加测试。
- **buildr**：Agent Service HTTP 契约新增 `DELETE /model-accounts/:accountId` 与 `GET /model-accounts/:accountId/usage`，路由与生成 DTO 同步更新。
- **buildr-web**：`AccountModelManager`、`ProviderConnectionDrawer`、`AgentConnectionSettings`、`modelSourceViews`、账号 API 客户端、样式与单元/浏览器场景；供应商侧栏搜索分组与托管来源退出登录。
- **持久化**：`accounts.json` 新增可选的已删除 linked 供应商集合；历史重复单账号供应商在读取时收敛；账号私有目录只在删除或收敛时移除，凭据仍不进入公共读取、事件、日志或 Git。
- **兼容性**：既有供应商、模型偏好、会话绑定和托管来源保持不变；删除与退出登录由用户显式发起并需要确认，删除不影响对话内容。
