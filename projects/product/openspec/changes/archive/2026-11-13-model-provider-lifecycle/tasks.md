## 1. Agent Service 供应商目录与删除

- [x] 1.1 扩展 `ModelAccessApplication.list()` 的供应商视图，返回 `connectionId` 与 `linked` 元数据，并覆盖全部内置供应商声明；同步 `operation-schemas.ts` 的 `modelProvider` schema 与生成 DTO。
- [x] 1.2 实现 `ModelAccessApplication.remove(id, {expectedRevision})`：校验修订、拒绝智能体托管账号、拒绝活动模型请求、停止登录尝试、等待检查结束、关闭运行时、撤销租约、移除账号与偏好，并安全删除账号私有目录。
- [x] 1.3 在账号存储中加入 linked 供应商删除抑制集合；`ensureLinked` 跳过已删除来源，`add()` 支持 linked 供应商重新接入并清除抑制。
- [x] 1.4 泛化内置供应商添加规则：非自定义、非 linked 供应商只允许一个账号；linked 供应商复用供应商 id；更新错误信息。
- [x] 1.5 新增 `buildr-agent` 单元测试覆盖供应商视图字段、自定义/API Key/独立订阅删除、凭据目录清理、活动请求拒绝、托管账号拒绝、linked 删除抑制与再添加。

## 2. HTTP 契约与前端客户端

- [x] 2.1 在 `agent-service-http-contracts.ts` 新增 `DELETE /model-accounts/:accountId` 操作，输出剩余 `modelAccounts`，并在 `agent-service-http.ts` 路由中处理 DELETE。
- [x] 2.2 运行 `npm --prefix services/buildr run contracts:generate:workspace` 与生成检查，更新前后端 DTO。
- [x] 2.3 在 `buildr-web` 的模型账号 API 客户端新增删除调用，并让 `modelAccounts` 响应类型包含供应商 `connectionId`/`linked` 元数据。

## 3. Web 界面

- [x] 3.1 将“添加自定义供应商”改为“添加供应商”，将“其他自定义供应商”改为“自定义供应商”，同步原型/测试中的用户可见文案。
- [x] 3.2 改造 `ProviderConnectionDrawer` 与 `AgentConnectionSettings`：由供应商声明生成接入方式列表，支持 API Key、订阅登录、linked 与自定义供应商；已接入项显示已接入并禁止重复添加，托管来源标明归智能体管理。
- [x] 3.3 在 `AccountModelManager` 供应商操作菜单新增“删除供应商”，实现确认弹层与清理说明；智能体托管来源不显示删除项并说明管理入口。
- [x] 3.4 删除成功后刷新账号目录、清空选择并保持其他供应商状态；错误时保留原卡片与可操作诊断。
- [x] 3.5 更新 Web 单元测试与浏览器场景夹具，覆盖完整供应商列表、命名、删除确认和删除后列表更新。

## 4. 删除影响、历史数据与托管登录

- [x] 4.1 新增账号级引用统计读取：按当前运行模型来源统计仍使用该账号的对话数，供删除确认按需读取；删除不修改对话。
- [x] 4.2 新增 `GET /model-accounts/:accountId/usage` 契约与前端 API，删除确认显示受影响对话数量，删除成功后提示重新选择模型。
- [x] 4.3 读取旧 `accounts.json` 时收敛单账号供应商的历史重复账号，保留可用且模型与凭据更完整的一项，清理其余账号、偏好与私有目录。
- [x] 4.4 托管来源新增“退出登录”：确认后断开对应智能体连接、关闭运行时并撤销租约；普通来源仍为“断开供应商”。
- [x] 4.5 供应商侧栏新增搜索与订阅账号、API Key、自定义供应商、智能体接入分组。
- [x] 4.6 更新 `model-access`、HTTP、前端单元与浏览器场景，覆盖引用统计、重复账号收敛、托管退出、搜索分组及删除影响提示。
- [x] 4.7 修复既有浏览器 setup 组失败：旧页签断言改为“账号与额度”，回推开关按表单项定位，供应商下拉按虚拟列表逐屏采集。

## 5. 文档与验收

- [x] 5.1 更新 `knowledge/docs/architecture/agent-integration.md` 的供应商管理说明与删除边界。
- [x] 5.2 运行 `buildr-agent` 单元测试、类型检查与源边界检查；运行 `buildr-web` 单元测试、静态检查与类型检查；运行 HTTP 契约生成检查。
- [x] 5.3 在隔离浏览器场景中核对添加供应商列表、删除确认与删除后列表更新，保留截图证据；完整 setup 组已通过。
