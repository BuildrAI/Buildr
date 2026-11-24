## Context

随着 Buildr 拆分为 `Buildr Harness` 与 `Buildr Development` 两条并列产品线，用户会在同一桌面环境与浏览器置顶页签中同时使用两者。`Buildr Harness` 已采用象形 `H` 图标和 `Buildr Harness` / `Buildr Harness Dev` 命名；工程工作台仍使用 `B` 图标及 `Buildr Web` / `Buildr Web Dev` 命名。本变更负责完成象形 `D` 图标替换与全链条可见命名对齐。

## Goals / Non-Goals

**Goals:**
- 将桌面启动器与网页多尺寸页签图标更新为与 `H` 同系列的象形 `D` 视觉规范，同时完整保留 `buildr-icon.png` 作为母品牌资产。
- 将前端页面标题、顶栏标志与用户可见产品名统一为 `Buildr Development`（开发版为 `Buildr Development Dev`），与 `D` 图标形成直觉一致。
- 将正式及开发启动器默认入口更新为 `Buildr Development` / `Buildr Development Dev`，并确保既有用户升级、修复、状态检查与 CLI 跨版路由平滑兼容旧入口。

**Non-Goals:**
- 不修改数据目录（`Buildr` / `Buildr Dev`）、日志目录、CLI 命令名（`buildr web ...`）、npm 包名（`@buildr-ai/buildr`）或 `CFBundleIdentifier`。
- 不修改既有 HTTP API、JSON Schema 协议字段及自动化依赖的 DOM `id`（如 `#restart-buildr`、`#quit-buildr`）。
- 不调整内部开发工具脚本文件名或图标资源文件路径（继续复用 `resources/installation/launcher/Buildr.icns` 与 `Buildr.ico`）。

## Decisions

### 1. 保留底层身份与图标文件名，仅更新视觉内容与可见入口名
- **决定**：保持 `Buildr.icns` / `Buildr.ico` 文件名、`DEVELOPMENT_BUNDLE_IDENTIFIER`、`macBundleIdentifier`、数据根和日志目录不变，只替换图标字节和用户可见的 Bundle/快捷方式/网页名称。
- **原因**：`application-payload` 清单、Bundle ID 历史兼容和既有用户本机数据目录均绑定这些底层身份，保持不变可将迁移成本与回归风险降至最低；相比全面重命名包/数据根，该方案无需迁移用户数据库与状态文件。

### 2. 启动器发现与迁移采用“新名优先、旧名兼容回退、所有权验证后清理”
- **决定**：
  - 正式启动器候选顺序调整为：先 `/Applications/Buildr Development.app` 与 `~/Applications/Buildr Development.app`，再 `/Applications/Buildr Web.app` 与 `~/Applications/Buildr Web.app`（Windows 为 `Buildr Development.lnk` 后接 `Buildr Web.lnk`）。
  - 开发启动器及 CLI 路由发现使用共享解析逻辑：优先检查 `Buildr Development Dev`，不存在时回退读取旧 `Buildr Web Dev`。
  - 安装或非 `--target` 刷新升级时，若旧入口可证明属于同一安装槽位或开发渠道所有权，则在新入口校验就绪后再安全清理旧入口；无法证明所有权的外部目标一律保留。
- **原因**：既保证新安装呈现新名称，又防止升级或更新中途因旧版启动器尚未重装而导致 `workspace-cli-routing`、自举脚本或用户更新链路中断。

## Risks / Trade-offs

- [macOS 桌面与浏览器图标/名称缓存] → 重建启动器与页面构建产物后，本机通过更新安装开发应用及刷新/重新置顶浏览器页签即可更新缓存。
- [Windows 快捷方式迁移未在 macOS 本机实机覆盖] → 通过单元测试与注入的 `writeShortcut`/`readShortcut` 夹具验证 Windows 路径、描述及旧快捷方式安全清理逻辑，并在任务验证报告中明确标注未实机验证项。
