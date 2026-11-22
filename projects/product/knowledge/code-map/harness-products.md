# 双产品代码地图

范围：Harness 执行与目录级工作环境，Development 工程应用及网页组合。产品解释见[边界说明](../docs/architecture/harness-products.md)。本地图按源码职责定位，不替代运行或发行验收。

| 代码位置 | 所属产品与责任 |
| --- | --- |
| `services/buildr-harness/src/application/` | Harness 对话和执行用例；不拥有工程任务状态 |
| `services/buildr-harness/src/executors/` | 原生执行适配与程序管理 |
| `services/buildr-harness/src/model-access/` | 模型来源及独立账号接入 |
| `services/buildr-harness/src/process/` | 后台连接、准确执行归属、代次、独立网页及认证 |
| `services/buildr-harness/src/process/directory-picker.ts` | 服务所在电脑的图形目录选择，固定系统参数、有限超时；选择或取消本身不登记目录 |
| `services/buildr-harness/src/interfaces/http/` | 唯一通用 HTTP/OpenAPI 实现 |
| `services/buildr-harness/src/cli.ts`、`src/*launcher*.ts` | 独立 CLI 和本机启动器 |
| `services/buildr-harness/src/web-resource.ts` | 安装后完整网页资源的公共定位，不启动后台 |
| `services/buildr-harness/tools/` | 核心构建、运行包物化、本机制包及准确发行证据 |
| `services/buildr-harness-web/src/HarnessApp.tsx` | 独立完整网页装配、目录起点及兼容窗口协议 |
| `services/buildr-harness-web/src/features/agent-conversations/` | 唯一对话页面、设置、输入附件、状态及控制 |
| `services/buildr-harness-web/src/conversation.ts`、`integration/` | 完整对话公开入口、原 Provider 装配及有限宿主接口；可选工作上下文、对象打开与布局请求，不管理任务业务 |
| `services/buildr-harness-web/src/directory-files.tsx`、`engineering-files.ts` | 显式文件能力接口及兼容窗口适配；独立网页提供读取预览，Development 装配接现有工程文件操作 |
| `services/buildr-web/src/features/harness-ui/` | Development 的工程范围、同页完整对话装配、任务关联、工程参与与文件/对象打开适配 |
| `services/buildr/src/modules/agent-service/module.ts` | Development 工程范围权威和公共核心连接装配 |
| `services/buildr/src/web/http/router.ts` | Development 认证、工程路由及 `/harness/` 网页托管 |

## 目录工作台

- **Harness 后端**（`services/buildr-harness/src/`）
  - [目录引用](../../services/buildr-harness/src/application/directory-host.ts)：选择来源、记录身份、重新核对准确目录；命中同数据域已登记工作空间时复用原身份。
  - [本机工作空间解析](../../services/buildr-harness/src/application/local-workspaces.ts)：零依赖读取同数据域 `workspace-registry.json`、工作空间元数据及 `@default` 并核验文件系统身份，支持 Development 离线时的工作空间与工作台独立解析。
  - [目录工作台](../../services/buildr-harness/src/application/directory-workbench.ts)与[仓库发现](../../services/buildr-harness/src/application/directory-checkouts.ts)：以明确目录为锚，有界发现本机仓库并按实际 Git 登记复核检出，不依赖对话或 Development 的工程登记。
  - [通用入口](../../services/buildr-harness/src/workbench.ts)：文件读取与编辑保护、打开文件夹、检出身份、分支切换、远程获取/同步/推送；供 Development 的工程应用复用，不启动执行后台。
  - [本地 Git 动作](../../services/buildr-harness/src/workbench/local-git.ts)：明确暂存、取消暂存和版本保护的本地提交，不隐式推送。
- **Harness 前端**（`services/buildr-harness-web/src/`）
  - [独立目录装配](../../services/buildr-harness-web/src/features/directory-workbench/HarnessDirectoryWorkbench.tsx)：仓库与工作树选择、模块切换和跨工作树准确跳转；两个模块采用同一浏览身份。
  - [资源管理器](../../services/buildr-harness-web/src/explorer.ts)与[源代码管理](../../services/buildr-harness-web/src/source-control.ts)：可分别装配的公开视图；由宿主提供观察和动作，不调用 Development API。
- **Development 复用**（`services/buildr*/src/`）
  - [工程代码应用](../../services/buildr/src/modules/code/application/code-application.ts)：根据登记与真实检出解析工程范围；文件及 Git 观察调用 Harness 通用实现。
  - [工程资源管理器](../../services/buildr-web/src/features/code/pages/CodeExplorerPage.tsx)与[工程源代码管理](../../services/buildr-web/src/features/code/pages/CodeSourceControlPage.tsx)：装配同源文件页签、通用视图和 Git 实现，保留原导航、编辑会话、任务深链与工程操作。

## 关键调用链

1. Development 的 harness-ui 准备准确工程范围，经公开 `HarnessConversationSurface` 装配原唯一对话 Provider 和完整对话页面。Harness Web 创建/打开对话并调用公共 HTTP，工程宿主解析准确执行目录和必要上下文。
2. Harness 将当前对话观察交给装配方；Development 通过可选上下文插槽呈现任务关联和工程参与，按已观察修订写入。不再使用对话 iframe、窗口消息或坐标覆盖；上下文故障与对话控制隔离。
3. 两种入口都由 Harness 处理模型选择、发送、审批、停止和恢复。Development 只交接明确工程操作，结果未知不重发。文件由 `HarnessDirectoryFiles` 接入，工程对象由宿主回调解释；当前分别接已有代码浏览器与任务导航，跳转前核验来源和对话选择代次。
4. 第一方前端构建从公开组件入口组合双方；Harness 核心仍将独立完整网页放入 `build/harness-web-dist/`，安装后独立及兼容入口使用所带产物，不依赖相邻源码。当前 Development 启动/路由保持不变，不代表已完成动态插件宿主。
5. 独立网页从范围发现取得内置或宿主提供的名称；目录工作空间显示保存的名称，未填写时默认目录名，同数据域已登记本地工作空间与 `@default` 在 Development 未运行时也由 Harness 内置解析并保持原范围身份。添加表单填写可选名称、通过受认证的本机选择接口取得目录，不提供手填路径，确认后登记（命中已有本地工作空间目录时复用原身份）并用于新对话，不初始化 Development 工程资产。Development 外壳独立保存对话展开与专注/分屏布局偏好并承接内嵌流程图顶层放大预览，不接管内层会话记忆。

## 验证入口

- Harness 核心：`services/buildr-harness/tools/testing/verification-checks.ts`。
- 独立入口与发行：`services/buildr-harness/tools/testing/entry-verification-checks.ts`。
- 完整网页：`services/buildr-harness-web/tools/testing/verification-checks.ts`，含迁移保留的完整对话逻辑测试与独立生产浏览器场景。
- Development 集成：`services/buildr/test/e2e/harness-frame.ts`，经隔离工作空间 runner 执行，核对认证、无对话 iframe、工程上下文、文件与任务打开、工作空间选择及草稿/阅读保留。
- 两包消费：`services/buildr/test/e2e/harness-products.ts`，仅消费明确的实际 tarball。

未改造的历史组件装配原型保存在 Harness 网页的 `prototypes/component-integration/`，不作为当前产品入口或当前架构证据。
