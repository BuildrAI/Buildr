# 系统、服务与工程资产

## Product 与 Service

| 层级 | 位置 | 当前责任 |
|---|---|---|
| Buildr Product | `projects/product/` | 产品规范、当前认知、Project/Service 登记、验证声明与共同交付边界 |
| Buildr Service | `projects/product/services/buildr/` | CLI、本机 HTTP Host、后端能力、数据、安装、诊断、工程和发布程序 |
| Buildr Web Frontend Service | `projects/product/services/buildr-web/` | React/Vite 前端源码、依赖、测试与正式构建 |

两个 Service 位于同一 Git repository，但仍拥有独立 `package.json`、依赖锁和测试责任。后端生成 HTTP DTO，前端消费派生 DTO；后端 `web-dist/` 托管前端正式构建结果。

## Buildr Service 工程资产

| 根目录 | 分类 | 内容边界 |
|---|---|---|
| `bin/` | 产品入口 | 只包含薄启动兼容入口 |
| `src/` | 产品实现 | Bootstrap、产品模块、Web Host 与通用 Infrastructure |
| `tools/` | 工程程序 | Build、Codegen、Development、Performance、Release、Testing |
| `test/` | 证明代码 | Unit、Component、Contract、Integration、System、Browser 与 Verification harness |
| `resources/` | 文件型交付源 | Workspace、Agent runtime、Installation、Contracts 与 Manifest |
| `docs/` | Service 文档 | CLI、资源、适配器与维护说明 |
| `package/` | 派生输出容器 | 仅 ignored `targets/test-context/`；不含长期源码或资源 |

## Buildr Web 工程资产

| 根目录 | 分类 | 内容边界 |
|---|---|---|
| `src/app/` | 应用组合 | Layout、Shell context 与 Agent Action Drawer |
| `src/features/` | 用户功能 | 页面、功能组件、Hooks 与专用 API |
| `src/api/` | 共享协议机制 | transport、Local Session、workspace shared clients 与 generated DTO |
| `src/components/` | 跨功能展示 | Markdown、Brief 与反馈等共享视图 |
| `src/lib/` | 通用前端机制 | label、文档链接、确认框、可调整布局等 |
| `test/` | 前端证明 | 渲染、交互、客户端与纯逻辑测试 |

## 构建与交付关系

```text
后端模块 HTTP Schema
  → buildr/tools/codegen/contracts
  → buildr 接口测试 DTO + buildr-web/src/api/generated DTO

buildr-web/src
  → Vite production build
  → buildr/web-dist
  → buildr/src/web 本机同源托管

buildr/src + resources + web-dist
  → tools/release Application Payload
  → npm Candidate / package
```

生成输出、Candidate staging 和 visual-check evidence 都是可重建投影，不成为业务事实源。
