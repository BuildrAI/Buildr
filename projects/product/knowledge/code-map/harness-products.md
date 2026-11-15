# 双产品代码地图

范围是 Harness 公共核心、完整共享界面、独立壳与 Development 装配；本图解释当前候选的职责和调用方向，不代替规范或验收结果。用户行为与限制见[产品说明](../docs/architecture/harness-products.md)。

## 服务与职责

| 位置 | 职责与代表入口 |
| --- | --- |
| [`buildr-agent/src/profile.ts`](../../services/buildr-agent/src/profile.ts) | 纯配置域身份和旧路径兼容；轻量 `profile` 子路径不引入进程装配 |
| [`buildr-agent/src/process/`](../../services/buildr-agent/src/process/) | `client.ts` 连接、`activate-runtime.ts` 显式采用、`caller-sessions.ts` 调用权限、`server.ts` 私有传输与原代次控制 |
| [`buildr-agent/src/process/web-endpoint.ts`](../../services/buildr-agent/src/process/web-endpoint.ts) | 唯一网页监听权、认证与公共 HTTP 装配；`web-session-store.ts` 保存页面会话摘要，`web-assets.ts` 保留内容摘要资源 |
| [`buildr-agent/src/application/directory-host.ts`](../../services/buildr-agent/src/application/directory-host.ts) | 目录引用、身份观察、有限预览；不创建业务任务 |
| [`buildr-agent/src/interfaces/http/`](../../services/buildr-agent/src/interfaces/http/) | 唯一通用路由、校验、活动投影、程序接入、OpenAPI 和帮助；宿主只适配认证、输入及响应传输 |
| [`buildr-agent/src/persistence/programmatic-credentials.ts`](../../services/buildr-agent/src/persistence/programmatic-credentials.ts) | 程序凭据的持久维护；来源范围与旧 workspace 投影保全 |
| [`buildr-agent/tools/`](../../services/buildr-agent/tools/) | `codegen/http-dto.ts` 唯一 DTO 生成，`package-runtime.ts` 物化运行包；核心测试不借用 Development 私有工具 |
| [`buildr-harness-ui/src/features/agent-conversations/`](../../services/buildr-harness-ui/src/features/agent-conversations/) | 列表/历史、消息与工具、输入/附件/发送、精确控制、模型/智能体/程序设置，复用同一状态容器与公共客户端 |
| [`buildr-harness-ui/src/host.tsx`](../../services/buildr-harness-ui/src/host.tsx) | 具名窄宿主接口：任务控件、参与观察、文件读取/打开和工作对象链接解析；无万能分派或 Development 反向依赖 |
| [`buildr-harness-web/src/HarnessApp.tsx`](../../services/buildr-harness-web/src/HarnessApp.tsx) | 独立目录导航与文件预览的薄装配；`main.tsx` 启动和票据消费，Vite 输出正式静态资源 |
| [`buildr-harness/src/`](../../services/buildr-harness/src/) | `cli.ts` 启动、显式激活及启动器命令；`launcher.ts` 校验入口、Node 与自有应用绑定；发行决定与证据核对独立于执行控制 |
| [`buildr-harness/src/windows-launcher.ts`](../../services/buildr-harness/src/windows-launcher.ts) | Windows `.lnk`、明确 PowerShell 包装、旁文件及回滚；与 macOS 共用 `launcher-binding.ts` 的产品/入口校验，不宣称已取得 Windows 实测 |
| [`buildr-web/src/features/agent-conversations/DevelopmentHarnessHost.tsx`](../../services/buildr-web/src/features/agent-conversations/DevelopmentHarnessHost.tsx) | 回接任务、工程参与和文件导航；其余旧路径多为兼容导出，不是第二份界面实现 |
| [`buildr/src/modules/agent-service/module.ts`](../../services/buildr/src/modules/agent-service/module.ts) | Development 来源、工程权威和固定目标认证装配；不维护核心数据库或厂商 SDK |

## 关键协作

两个 CLI/应用入口先使用公共准备与连接能力，再由共享后台处理对应操作。独立网页经页面会话访问同一 HTTP 操作；Development 经自身同源认证访问相同公共实现。客户端把来源和目标范围交给核心，核心分别核对读取权限、既有执行控制与宿主权威。只有实际工程业务回调进入 Development 的任务、工作空间或代码模块。

前端的三种托管形态均从 `buildr-harness-ui` 导入完整交互，不分别维护发送和控制器。Development 保留业务组件，独立壳只贡献目录/文件能力；共有 Markdown、分屏、抽屉、复制、主题和 Mermaid 渲染器属于共享包。

## 构建和测试

- 独立包：[`prepare-package.ts`](../../services/buildr-harness/tools/prepare-package.ts) → 独立网页正式构建 → 核心公开包物化 → CLI 编译与第三方许可收集 → [`pack-local.ts`](../../services/buildr-harness/tools/pack-local.ts)。
- Development：[`prepare-development-ui.ts`](../../services/buildr/tools/development/prepare-development-ui.ts) 物化不含依赖目录的公共 UI，避免链接引入多份 React；构建只消费这个公开包。
- 三个新服务均提供 `tools/testing/verification-checks.ts`，由 [`registry.ts`](../../services/buildr/test/verification/registry.ts) 组合；归属审计从这些真实入口推导，不镜像测试清单。
- [`harness-products.ts`](../../services/buildr/test/e2e/harness-products.ts) 在工作空间隔离 runner 下消费两份准确 tarball，检查两种启动顺序、卸载与保留负载重启。`--platform-launchers` 在 macOS 实际并发打开两个应用：Development 首次从 CLI 直启安全交接给绑定启动器，随后复用准确 Web 进程；Harness 核心代次始终保持。认证退出和物理进程退出分别核对，失败也处理已观察的自有入口。其通过不替代异版本、真实原生账号或其他平台验收。
- [`inspect-artifact-distribution.ts`](../../services/buildr-harness/tools/inspect-artifact-distribution.ts) 读取两种包的实际许可与平台声明；正式 [`trusted-publish.ts`](../../../../skills/buildr-release/scripts/trusted-publish.ts) 在新 npm 写入前调用，已确认公开事实的读取仍独立保留。

来源观察是当前候选代码、服务登记及三项活动变更；打包和运行结果仍须查任务验证，不从地图中推导完成状态。
