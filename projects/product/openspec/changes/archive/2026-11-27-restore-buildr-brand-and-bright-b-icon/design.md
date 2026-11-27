# Design: 统一 Buildr 品牌视觉与桌面入口命名

## 1. 图标统一策略
- 以 `buildr-development-dsh-plugin` 现用的 4 段路径等距亮色立体 `B`（`#1f92f6`、`#f8af08`、`#14b3a4`）作为唯一视觉母版，搭配 `#fbfaf7` 暖白底卡片与 `#dbe4ee` 细边框。
- `buildr-web` 顶栏使用内联矢量 `B` 标志替代纯文本字母 `D`，`.brand-mark` 调整为与卡片底色一致的浅色圆角方块。
- 移除不再使用的 `projects/product/assets/branding/buildr-development-icon.png`，将新版亮色 `B` 主图写入 `projects/product/assets/branding/buildr-icon.png`，按目标像素尺寸矢量渲染输出多尺寸网页页签图标及桌面 `Buildr.icns` / `Buildr.ico`。

## 2. 命名与旧入口迁移兼容性
- Web 壳层：入口 `<title>`、正式态页签名称、顶栏产品名及重启/退出提示文案统一使用 `Buildr`，仅在校验通过的 `development` Web profile 下将页签产品名显示为 `Buildr Dev`（保留“开发版”徽章）。
- 启动器安装、刷新、状态检查与卸载保留完整旧入口兼容链路：
  - 正式版候选顺序：`Buildr` → `Buildr Development` → `Buildr Web`；
  - 开发版候选顺序：`Buildr Dev` → `Buildr Development Dev` → `Buildr Web Dev`；
  - 新入口安装并校验通过后，仅清理可证明属于同一安装槽位或开发渠道所有权的旧名入口，外部未知入口一律保留并报告。
- Windows npm Launcher 同步兼容清理旧包装文件 `Buildr Development Runner.cmd` / `Buildr Development.vbs` 与 `Buildr Web Runner.cmd` / `Buildr Web.vbs`。
- 跨服务发现（`buildr-harness` 开发 CLI 垫片、`buildr-development-dsh-plugin` 正式入口发现）优先读取新版 `Buildr` / `Buildr Dev` 入口并回退旧名入口，全局 CLI 兼容检查同时识别新旧开发启动器关键字。
