## 1. 文档闸门

- [x] 1.1 完成 OpenSpec proposal / design / specs / tasks，并 `openspec validate --strict` 通过
- [x] 1.2 撰写 Brief（含 1A+2A、非目标与「先文档确认再实现」闸门）
- [x] 1.3 取得产品对 Brief / design 的确认后再进入实现（未确认前不得创建 `buildr-web` 目录或搬代码）

## 2. Service 登记与骨架

- [x] 2.1 在 `projects/product/services/manifest.yml` 登记 `buildr-web`（`source.type: workspace`，`path: projects/product/services/buildr-web`）
- [x] 2.2 创建 `projects/product/services/buildr-web` 骨架与 Service 级 `AGENTS.md`（说明前端所有权与构建交接）
- [x] 2.3 确认 Local App / doctor 可读到 `buildr-web`，且与 `buildr` 的 `source.path` 不重叠

## 3. 前端源码迁移与构建交接

- [x] 3.1 将 `projects/product/services/buildr/web` 迁入 `buildr-web`，保留 React/Vite/TS 栈与路由契约
- [x] 3.2 配置 `buildr-web` 正式构建，产出可被 `buildr` 消费的静态资产
- [x] 3.3 更新 `buildr` 构建/打包/launcher 步骤：消费 `buildr-web` 产物到既有 `web-dist`（或等价可证明路径）
- [x] 3.4 删除 `buildr` 内权威前端源工程，消除双源；更新仓库内路径引用

## 4. 托管与三入口一致性

- [x] 4.1 确认 Local App HTTP 仍从 `buildr` 内 dist 同源 loopback 托管并注入 session
- [x] 4.2 确认 checkout / npm pack / launcher 三入口打开同一套 React shell
- [x] 4.3 确认已安装或仅含 dist 的环境不依赖 `buildr-web` 源码或 Vite 开发服务器

## 5. 当前认知与直接验证反馈

- [x] 5.1 更新 `openspec/knowledge/architecture/technical.md` 中 Service 拓扑（`buildr` + `buildr-web`）
- [x] 5.2 更新 `openspec/knowledge/services/buildr.md`，并新增 `openspec/knowledge/services/buildr-web.md`
- [x] 5.3 按需更新 glossary / overview 中与 `buildr-web` 相关的术语或入口说明
- [x] 5.4 运行受影响的快速反馈（含生产托管路径下的 browser smoke 或等价 selector），修复回归
- [x] 5.5 刷新 `.buildr/knowledge-impact.yml`（reconcile），确保 Brief 与权威 artifacts 对齐

## 6. Archive readiness

- [x] 6.1 核对 delta specs 与实现一致，`openspec validate introduce-buildr-web-service --strict` 仍通过
- [x] 6.2 完成 Change 收敛/归档所需的 specs sync 与 archive readiness 检查（不含 Task Finish）
