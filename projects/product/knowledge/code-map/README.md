# Buildr 全项目代码地图

本地图描述当前实现，不描述迁移前路径或后续自动生成设想。阅读顺序对应四个层次。

1. [系统、服务与工程资产](system-services-assets.md)：先确定代码属于哪个服务、工程目录或交付资产。
2. [功能与模块](modules.md)：按用户能力找到后端模块和前端功能。
3. [技术层、对象与代表方法](technical-layers.md)：继续定位领域、应用、持久化、基础设施、接口与对象装配。
4. [关键调用、数据与副作用](calls-data-effects.md)：核对跨模块调用、数据所有权、锁、事务、进程和文件写入。

可交互技术图：

- [Buildr 系统总览](../archify/system/buildr-system-overview.html)
- [能力、数据与副作用流](../archify/flows/capability-data-responsibility.html)

## 一级：系统、服务与工程资产

| 范围 | 位置 | 责任 |
|---|---|---|
| Buildr Product 治理 | `projects/product/` | 规范、知识、Project 声明、验证声明和两个 Service 的共同边界 |
| Buildr 后端 Service | `projects/product/services/buildr/` | CLI、本机 HTTP Host、业务模块、SQLite/YAML 持久化、安装、诊断、工程与发布程序 |
| Buildr Web 前端 Service | `projects/product/services/buildr-web/` | React 页面、功能状态、HTTP 客户端和正式 Web 构建 |
| Project 级端到端测试（End-to-End Test） | `projects/product/services/buildr/test/browser-smoke/` 与验证入口 | 证明真实后端与前端组合后的产品流程；物理入口由后端测试宿主运行，责任仍属于 Product |

## 后端 Service 根目录

| 目录 | 只负责 |
|---|---|
| `bin/` | 薄启动入口；`bin/buildr.mjs` 委托 Bootstrap |
| `src/` | 发布进 npm 应用负载的产品实现 |
| `tools/` | 构建、代码生成、测试支撑、性能、发布与 Launcher 工程程序 |
| `test/` | 后端与跨服务产品行为的证明及专用 fixture/helper |
| `resources/` | Workspace、Agent runtime、安装图标等文件型交付源资产 |
| `docs/` | 后端 Service 使用与维护说明 |
| `package/` | 仅保留忽略的派生 `targets/test-context/`；不再承载长期源码或资源 |

## 前端 Service 根目录

| 目录 | 只负责 |
|---|---|
| `src/app/` | 应用壳、布局、全局操作抽屉 |
| `src/features/` | 按 Workspace、Project、Service、Task、Publication、Installation 等用户能力组织页面、组件、Hooks 和专用 API |
| `src/api/` | 共享 HTTP transport、会话和生成 DTO；不承载页面业务状态 |
| `src/components/` | 跨功能复用的展示组件 |
| `src/lib/` | 无业务所有权的前端辅助机制 |
| `test/` | 前端渲染、交互、客户端与纯逻辑测试 |

## 边界判断

- 后端业务进入 `src/modules/<capability>/`；跨模块通用技术机制进入 `src/infrastructure/`。
- 本机 Web 进程、会话、静态文件和路由分发进入后端 `src/web/`，业务 HTTP 协议仍由所属模块贡献。
- 工程程序不能反向成为产品运行时依赖；生成 DTO 是派生产物，不是第二份协议源。
- 用户项目的测试实现留在用户项目；`project-testing` 只管理其测试声明，不执行 Buildr 自测。
