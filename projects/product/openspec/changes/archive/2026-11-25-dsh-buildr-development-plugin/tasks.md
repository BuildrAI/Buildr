# 实施任务清单

- [x] 1. 扩展 `buildr-harness-web/src/dsh-desktop-bridge.ts`，支持独立配置桌面通知频道前缀与激活态
- [x] 2. 在 `buildr-web` 实现 `dsh-desktop.tsx` 宿主桥接与原生右侧工具页，并在 `main.tsx`、`AppLayout.tsx`、`DevelopmentHarnessShell.tsx`、`ConversationWorkspace.tsx`、`styles.css` 接入工作空间广播、返回 DSH、切换右侧栏、文件定位与大图预览
- [x] 3. 新建 `projects/product/services/buildr-development-dsh-plugin`（含正式与开发双形态配置、官方 D 形彩色矢量图标、`guest`/`workspace`/`refresh`/`image-preview`/`launcher`/`installation`/`desktop-activation` 模块、`tools/build-dev.ts` 构建脚本与全套单元测试及桌面验收指南）
- [x] 4. 更新项目与服务清单、`verification.yml`、`buildr-release`（接入 `dsh-buildr-development` 独立发布目标，暂停公开上传）及 `buildr-self-bootstrap-sync`（同时管理本机 Buildr Development Dev 插件安装校验），更新相关架构/发布文档
- [x] 5. 运行单元、静态、前后端逻辑、`self-bootstrap-closeout` 与独立目标发布打包测试
- [x] 6. 在隔离 DSH 桌面 `0.2.2-rc.5` 中完成开发版与候选正式版实测验收（验证无嵌入阻断），并在本机真实 `/Users/chenjun/.dsh/profiles/desktop` 安装就绪 `Buildr Development Dev` 且验证其与 `Buildr Harness Dev` 并存可用
