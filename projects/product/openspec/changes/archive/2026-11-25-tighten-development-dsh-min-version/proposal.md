# 变更提案：收紧 @buildr-ai/dsh-buildr-development 对主包的最低兼容版本至 0.1.0-rc.67

## 背景
`@buildr-ai/buildr@0.1.0-rc.65` 与 `0.1.0-rc.66` 均发布于新版 Buildr Web 桌面桥接（`dsh-desktop.tsx`）合入前。若正式插件 `@buildr-ai/dsh-buildr-development` 仍允许连接 `0.1.0-rc.65` / `0.1.0-rc.66`，用户在 DSH 右侧栏工具页与跨页导航时无法完整获得桌面桥接能力。

## 方案
- 将 `@buildr-ai/dsh-buildr-development` 的 `@buildr-ai/buildr` 最低兼容版本从 `0.1.0-rc.65` 收紧至 `0.1.0-rc.67`；
- 调整 `discoverFromLauncher` 查找顺序为优先用户目录 `~/Applications`，再回落系统 `/Applications`；
- 补充 `tools/verify-desktop-pair.ts` 隔离桌面配对验收工具与参数单测，用于正式发布前配对验收已发布的 `@buildr-ai/buildr` 原包。
