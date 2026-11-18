# buildr dev 设计

## 进程模型

`buildr dev` 是一个前台监督器，启动并管理以下进程：

| 进程 | 运行方式 | 改动后的行为 |
|---|---|---|
| 开发宿主（buildr） | `node --watch bin/buildr.mjs web --port <port> --no-open` | 宿主重启，Vite 服务保持运行 |
| buildr-web | Vite 开发服务器，端口 5173 | 浏览器热更新 |
| buildr-harness-web | Vite 开发服务器，端口 5174，base `/harness/` | 浏览器热更新 |
| buildr-harness | 监听源码，重建私有包并切换 agent-service 运行单元 | 只切换 harness 运行单元 |

监督器负责启动、健康等待、日志前缀、退出清理。启动前若已有健康 development 实例，使用实例记录中的 secret 调用 `POST /api/v1/app/quit-instance`，确认旧进程退出后再启动源码宿主。退出时停止子进程；不把开发实例伪装成交付实例。

## 会话与同源

开发宿主启动时生成页面会话令牌，只通过宿主自身的 `/` 页面暴露。两个 Vite 开发服务器在 serve 模式提供一个开发插件：

1. 读取宿主 `GET /` 页面，解析 `<meta name="buildr-session">`；
2. 把同一 meta 注入 Vite 的 `index.html`；
3. 转发宿主的 `buildr-image` cookie，供对话图片请求使用。

两个 Vite 开发服务器都把 `/api` 代理到开发宿主，并改写 `Host` 与 `Origin` 为宿主地址，满足宿主现有的同源校验。不新增公开的令牌接口，不在发布版启用开发插件。

## Harness 页面

buildr-web 的 Vite 开发服务器把 `/harness` 代理到 harness-web 的 Vite 开发服务器（base `/harness/`），并支持 WebSocket。harness 页面的 HMR 客户端由 harness-web 的 Vite 配置指向 5174；页面文档和资源经 5173 同源代理，API 仍走 `/api`。

## 后端 watch

- buildr：Node 24 直接从源码执行 `.ts`，`node --watch` 负责重启。
- buildr-harness：监听 `buildr-harness/src`、`tools` 和包配置，去抖后执行 `prepareDevelopmentAgent` 与 `activateAgentServiceRuntime`，更新 agent-service 运行单元。宿主保持运行并重新连接；harness HTTP 契约变化导致宿主类型需要更新时，明确提示需要重启 `buildr dev` 或宿主。
- buildr-harness-web 的改动由 Vite 热更新处理，不触发运行单元重建。

## 预览功能的影响

预览实例使用 `<development data root>/previews/<name>` 作为独立数据根，并监听自己的端口，与普通 development 实例相互隔离。开发模式遵守同一边界：

- `buildr dev` 只认证停止普通 development 实例（development `instance.json` 对应的端口与 secret），不扫描、不接管、不停止任何预览实例。
- 开发宿主的 Vite 服务只服务当前 checkout 的开发页面；预览仍从自己的任务工作树准备候选产物，并从预览数据根启动，不消费开发模式的 Vite 服务。
- 两个 Vite 开发插件只在 serve 模式启用，预览候选的生产构建路径不变。预览候选摘要会包含 `vite.config.*` 内容，因此开发配置变化可能触发一次候选重新准备，但不改变构建结果或预览行为。
- 预览的 agent runtime 与模型目录是启动时从 development 根复制/复用的只读副本；开发模式的 harness 快速重建只写 development 根的运行单元，不会写入预览数据根。预览在重建进行中启动时，只会看到重建前后某一份完整包，不会看到半成品；需要新 harness 时由用户重新启动该预览。
- 退出 `buildr dev` 不删除、不停止预览实例及其数据。

## 边界与失败

- 开发模式只使用 development profile；不写入正式交付状态，不生成验证报告。
- 端口被未知进程占用、旧实例无法认证停止、宿主健康超时或 Vite 启动失败时，停止相关进程并报告具体原因，不接管其他实例。
- 退出后不自动把开发版恢复成 Launcher 实例；保留可核对的停止结果和重新打开方式。
- 发布版仍只托管正式构建产物；开发插件仅在 Vite serve 模式启用。
