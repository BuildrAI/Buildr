---
name: ui-visual-redesign
description: 用户要求 Local App 或产品 Web UI 重构、换肤、视觉方向调整、杂志感/产品感改版，或引入/更换前端组件库（如 Ant Design）时使用；在编码前强制审美闸门，并在引入组件库时执行 CSP、依赖与 Environment re-prepare 硬清单。
---

# UI 视觉重构闸门

本 Skill 沉淀自 `redesign-local-app-ui` 复盘：避免未锁定审美就大规模编码，以及引入组件库后把 CSP / 依赖 / Environment 漂移拖到收尾才暴露。

不替代 OpenSpec、Task Development、Task Environment 或 Verification；只补视觉类 Change 的编码前与依赖变更清单。

## 1. 何时适用

命中任一即可加载本 Skill：

- Local App / 产品面「重构 UI」「换肤」「视觉方向」「全应用 reskin」；
- Brief 含视觉方向、品牌色、字体、布局气质、组件库选型；
- 新增或更换打包进产物的 UI 组件库、图标库、主题体系（例如 `antd`）。

纯功能等价迁移、无外观承诺的改动不适用。

## 2. 编码前审美闸门（硬停止）

在写实现代码、安装 UI 依赖或大范围改样式**之前**，Brief（或经用户确认的等价决策记录）必须至少满足其一：

1. **可接受审美样本 / 反例**：写明「要像什么 / 不要像什么」（可引用既有产品、公开参考或上轮被否方向），并由用户明确确认；或  
2. **1 屏静态稿**：先交付单屏静态稿（HTML/CSS、设计导出或可点击的静态预览均可），用户确认后再编码。

未满足时：

- 只允许维护 Brief / design / proposal / 静态稿；
- 不得开始页面实现、全局样式体系重写或组件库接入；
- 向用户给出闸门缺口与确认问题后停止。

用户推翻已确认方向时，视为闸门失效：先更新 Brief 并重新确认样本/反例或静态稿，再继续编码；不得在旧闸门上硬改第二套实现而不留决策痕迹。

Brief 建议增加小节（名称可调整，语义必须覆盖）：

```markdown
## 审美闸门

| 项 | 内容 |
|----|------|
| 可接受样本 | … |
| 反例（明确不要） | … |
| 静态稿 | 路径或「不适用：已用样本/反例确认」 |
| 用户确认 | 日期与结论 |
```

## 3. 引入组件库硬清单

首次引入或更换会进入生产构建产物的 UI 组件库 / 图标库 / 主题运行时时，在继续实现与验证前必须逐项完成并留下可核对痕迹（Brief、design 或 Task 笔记均可）：

| # | 检查项 | 完成标准 |
|---|--------|----------|
| 1 | 依赖与锁文件 | `package.json` / lockfile 已更新；版本钉扎策略写明 |
| 2 | 离线 / CSP | 无 CDN；字体与脚本同源打包；若需放宽 CSP（如 css-in-js 的 `style-src 'unsafe-inline'`），在 Brief/design 显式记录风险与范围 |
| 3 | Environment re-prepare | 变更 `package.json` 或 lockfile 后，对当前 Task 立即 `task environment prepare`（或等价恢复），直到 matching **ready**；不得把 `npm-ci` input 漂移留到「收尾」 |
| 4 | 生产托管预览 | 用 `buildr app` / `app preview` 验证 dist，不以纯 Vite HMR 冒充完成 |
| 5 | 浏览器钩子 | 保留或改写 smoke 所需的 `id` / `data-*`；Select/Modal 等替换后同步测试适配 |
| 6 | 构建产物抽查 | `web-dist`（或等价）无远程字体/脚本 URL |

任一项未完成：不得声称视觉 Change 可进入正式 Verification 或 Finish。

## 4. 与其他 Skill 的关系

- OpenSpec / Brief：审美闸门写入 Brief；组件库 CSP/依赖风险写入 design 或 Brief。
- Task Environment：清单第 3 项通过正式 Environment prepare/inspect 证明 ready。
- Task Development / Finish：未过闸门的编码或未完成清单的依赖变更，不形成可交付 Content Target。

## 5. 完成标准

- 编码前已有用户确认的样本/反例或 1 屏静态稿记录；
- 引入组件库时上表 6 项均可核对；
- Environment 在依赖变更后保持 ready，收尾时不再因 lockfile 漂移首次 blocked。
