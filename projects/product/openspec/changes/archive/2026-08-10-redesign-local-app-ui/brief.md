# 重构 Local App UI（已确认 · 修订）

## 一句话摘要

在路由、API、同源 session、离线 CSP 与产品边界不变的前提下，用 **Ant Design 5** 承载弹框/表格/表单/布局，以**柔和产品感**重构 `buildr-web`；正式验收走 `buildr app` 生产托管 dist。

## 已确认决策（2026-08-10 修订）

| 项 | 选择 |
|----|------|
| 1. 范围 | **A** 全应用 |
| 2. 视觉方向 | **C** 柔和产品感 |
| 3. DOM 钩子 | **A** 尽量保留（antd 包装层保住 id / data-\*） |
| 4. 品牌色 | **B** 全新色板（柔和产品 token；无 CDN） |
| 5. UI 框架 | **A** Ant Design 5（`antd` + 必要 icons；Vite 打包进 dist） |

**作废：** 杂志/编辑感实现与 Fraunces 杂志排版方向。

**当前闸门：** 五项已确认，允许在 worktree 实现；合入靠「收尾」。

## 硬约束

- 路由 path 与功能行为等价  
- API、同源 session、离线 CSP（antd 与字体均同源打包，禁 CDN）  
- 不扩大产品边界  
- 托管 `buildr` `web-dist`；验收 `buildr app` + browser-smoke  

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [local-app-web-client delta](specs/local-app-web-client/spec.md)
- [local-app-browser-verification delta](specs/local-app-browser-verification/spec.md)
