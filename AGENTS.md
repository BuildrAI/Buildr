# AGENTS.md

<!-- buildr:required begin -->
请读取并遵循 [Buildr Core](rules/buildr/core.md)。
<!-- buildr:required end -->

## Buildr 自举原则

本 workspace 是 Buildr 用来开发 Buildr 自身的自举 workspace。正式自举激活成功时，PATH 中的默认 `buildr` 必须可证明绑定本次 delivered retained checkout，且最终 workspace Doctor 必须 ready。正式 sync、安装、CLI identity 检查与最终 Doctor 或 Finish resume 只由 `buildr-self-bootstrap-sync` Skill 的唯一 runner 编排；Agent 不得自行拆分、补跑或替代其中步骤。

- Buildr 产品治理事实只在 `projects/product/` 维护；可执行产品实现分属两个 Service：`projects/product/services/buildr/` 负责 npm package、CLI、本机应用 HTTP/运行时（runtime）、`web-dist` 托管与打包，`projects/product/services/buildr-web/` 负责 Local App React/Vite 权威前端源码与正式构建。当前 workspace 中由 Buildr 交付的资产只能通过当前 Product checkout 的 `update` / `sync` 更新，不直接编辑。

开发阶段执行 Buildr 命令时，使用本 workspace 内的产品 CLI 入口 `projects/product/buildr`，不要依赖本机 PATH 上安装的 `buildr`。
