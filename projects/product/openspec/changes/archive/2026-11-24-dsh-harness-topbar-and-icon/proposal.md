## 为什么

在 macOS 的 DeepSeek Harness（DSH）桌面端中栏使用 Buildr Harness 时，顶部为避让系统红绿灯和收起左栏后的宿主按钮预留了 48px 安全留白区，但该区域未配置 DSH 原生窗口拖拽声明，导致中栏顶部空白既无法拖动窗口，也无法通过双击放大或缩小 DSH，且展开左栏时显得空白突兀；同时，DSH 左侧边栏的 Buildr Harness / Buildr Harness Dev 入口图标仍使用早期临时线框图标，与 Buildr Harness 正式品牌图标不一致。

## 变化

- 修改 `harness-dsh-desktop-plugin`（以及协作的 `buildr-harness-web` 工作空间名称透传）：
  - 在 macOS DSH 桌面端中栏宿主槽位补齐 48px 轻量工作台顶栏，整条标记 `data-window-drag=""` 以承接窗口拖动与双击放大/缩小 DSH；
  - 顶栏左侧显示 Buildr Harness 官方彩色 H 图标、名称（开发版带轻 `Dev` 标识）及当前工作空间名称，中间与右侧保留大面积拖拽/双击空白；收起 DSH 左栏时内容自动按 `--dsh-frame-leading-clearance` 右移避让红绿灯与左栏按钮；
  - 将 DSH 左侧插件入口图标（`sidebar.panellist`）替换为无白底方框的官方 Buildr Harness 彩色 H 矢量图标（青绿/天蓝/琥珀金），正式版与开发版共用；
  - 在 `buildr-harness-web` 与插件消息桥中透传可选工作空间显示名（不触发右栏重新匹配），并兼容旧版消息回退默认名或目录叶名。

## 影响

`buildr-harness-dsh-plugin` 客户端、`buildr-harness-web` 桌面通知桥、插件单元测试、桌面验收说明及对应规范。见[任务说明](@task/dsh-harness-topbar-and-icon)。
