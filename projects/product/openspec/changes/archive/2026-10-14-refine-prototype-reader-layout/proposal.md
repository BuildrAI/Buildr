## Why

原型阅读器把关键状态切换放在标题和来源下方，额外占据一行；宽屏默认固定功能说明还会压缩正在体验的画面。用户已明确要求将切换移至首行，并让说明默认采用按需浮窗，先把这两项阅读器行为和原型技能（Skill）的生成口径同步。

## What Changes

- 桌面首行统一放置原型标题、关键状态切换、刷新与功能说明入口；窄屏允许自然换行，保留可访问的操作。
- 任务内阅读、单独查看及新生成的独立预览均默认收回功能说明且不固定；悬停或点击入口临时打开，空间充足时可手动固定并排。
- 保留既有说明高亮、阅读位置、页面切换时的手动固定选择和离线隔离边界，更新随包原型技能（Skill）及接入说明。
- 本变更没有接口（API）、存储或旧原型格式的破坏性变更；宽屏初始说明呈现方式按用户决定改变。中间页面竖向标签的第五版仅供继续评审，不成为本变更的正式工作空间布局承诺。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ui-prototype`：新生成独立预览的首行操作布局与功能说明默认浮窗方式。
- `buildr-web-client`：统一任务内及单独查看的原型首行操作和说明初始行为。

## Impact

影响 `projects/product/services/buildr-web/src/features/task/components/PrototypeTab.tsx`、配套阅读样式及复用它的独立预览；随包指引位于 `projects/product/services/buildr/resources/workspace/skills/buildr/ui-prototype/`。无需新增依赖、接口（API）或任务字段；真实任务及单独查看需要验证，旧自包含页面继续兼容。

任务范围与实施授权见[任务说明](@task/right-pane-collapse)。
