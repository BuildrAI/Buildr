# 双产品代码地图

范围：Harness 执行及完整网页，Development 工程现场及网页集成。产品解释见[边界说明](../docs/architecture/harness-products.md)。本地图按源码职责定位，不替代运行或发行验收。

| 代码位置 | 所属产品与责任 |
| --- | --- |
| `services/buildr-harness/src/application/` | Harness 对话和执行用例；不拥有工程任务状态 |
| `services/buildr-harness/src/executors/` | 原生执行适配与程序管理 |
| `services/buildr-harness/src/model-access/` | 模型来源及独立账号接入 |
| `services/buildr-harness/src/process/` | 后台连接、准确执行归属、代次、独立网页及认证 |
| `services/buildr-harness/src/interfaces/http/` | 唯一通用 HTTP/OpenAPI 实现 |
| `services/buildr-harness/src/cli.ts`、`src/*launcher*.ts` | 独立 CLI 和本机启动器 |
| `services/buildr-harness/src/web-resource.ts` | 安装后完整网页资源的公共定位，不启动后台 |
| `services/buildr-harness/tools/` | 核心构建、运行包物化、本机制包及准确发行证据 |
| `services/buildr-harness-web/src/HarnessApp.tsx` | 完整网页装配、目录起点及有限嵌入协议 |
| `services/buildr-harness-web/src/features/agent-conversations/` | 唯一对话页面、设置、输入附件、状态及控制 |
| `services/buildr-harness-web/src/directory-files.tsx`、`engineering-files.ts` | 目录文件能力；嵌入时请求 Development 准确工程文件操作，不注入任务组件 |
| `services/buildr-web/src/features/harness-ui/` | Development 的工作空间选择、iframe 布局、对话任务关联、工程参与及上下文交接 |
| `services/buildr/src/modules/agent-service/module.ts` | Development 工程范围权威和公共核心连接装配 |
| `services/buildr/src/web/http/router.ts` | Development 认证、工程路由及 `/harness/` 网页托管 |

## 关键调用链

1. Development 的 harness-ui 选择工程工作空间，向 iframe 传递明确范围；Harness Web 创建/打开对话并调用公共 HTTP。工程宿主向核心解析准确执行目录与必要上下文。
2. Harness Web 通知当前对话身份及输入区数值布局锚点；Development 自己查询当前对象并按已观察修订维护任务关联，控件原位呈现在工作空间信息旁，不把关联等同于执行授权或任务完成。
3. 两种呈现都由 Harness 自己处理模型选择、发送、审批、停止和恢复。Development 只交接明确工程操作；结果未知不重发。
4. Harness 核心构建把完整网页放入 `build/harness-web-dist/`；独立入口直接承载，Development 从同一公共包定位并嵌入，不依赖相邻源码。

## 验证入口

- Harness 核心：`services/buildr-harness/tools/testing/verification-checks.ts`。
- 独立入口与发行：`services/buildr-harness/tools/testing/entry-verification-checks.ts`。
- 完整网页：`services/buildr-harness-web/tools/testing/verification-checks.ts`，含迁移保留的完整对话逻辑测试与独立生产浏览器场景。
- Development 集成：`services/buildr/test/e2e/harness-frame.ts`，经隔离工作空间 runner 执行，核对认证、真实 iframe、工作空间选择、模式与草稿保留。
- 两包消费：`services/buildr/test/e2e/harness-products.ts`，仅消费明确的实际 tarball。

未改造的历史组件装配原型保存在 Harness 网页的 `prototypes/component-integration/`，不作为当前产品入口或当前架构证据。
