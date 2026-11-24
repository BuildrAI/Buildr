## 取舍

- 轻量工作台顶栏渲染在插件的 `Anchor` 占位组件（位于 DSH `.centerCol` 中）而不是全局浮层 `Shell`（位于 `.overlayLayer`，`z-index: 20`），从而处于 `.leadingSeat`（`z-index: 15`）和抽屉遮罩之下，既不会遮挡 macOS 收起左栏后的宿主按钮，也自然继承 DSH 的 `--dsh-frame-leading-clearance` 与 `[inert]` 禁拖规则；`Shell` 继续从 `max(anchor(top), var(--dsh-frame-top-clearance, 0px))` 向下铺开，紧贴顶栏底边细线下方。
- 使用 DSH 宿主的 `data-window-drag=""` 声明（配合 `paddingInlineStart: max(16px, var(--dsh-frame-leading-clearance, 0px))`）承接原生窗口拖动与双击缩放，而不内联硬编码 `-webkit-app-region: drag`，且不在顶栏内置可点击按钮或重复控件，确保左侧留白外的大面积区域均可稳定双击缩放 DSH。
- 左侧插件入口与顶栏共用同一无框 Buildr Harness 官方彩色 H 矢量图标（青绿 `#14b3a4`、天蓝 `#1f92f6`、琥珀金 `#e59e04` / `#f8af08`），去掉白底圆角框以在浅色、深色及毛玻璃侧栏下保持高辨识度。
- `buildr-harness-web` 在 `observeWorkspaceDirectory` 后及工作空间显示名更新时向插件附带 `scope.name`，插件对同 `id`/`path` 且仅 `name` 变化的通知仅刷新状态而不清空 `carrier` 或触发重新选栏，同时保留对缺失 `name` 的旧版负载回退默认工作空间或目录叶名的能力。
