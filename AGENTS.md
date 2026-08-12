# AGENTS.md

<!-- buildr:required begin -->
请读取并遵循 [Buildr Core](rules/buildr/core.md)。
<!-- buildr:required end -->

## Buildr 自举原则

本 workspace 是 Buildr 用来开发 Buildr 自身的自举 workspace。每个 Buildr 开发任务收尾时，必须检查本次变更是否影响 Rules、Skills、Components、Commands、项目结构或 Agent runtime 入口；如有影响，按需运行 `projects/product/buildr sync <agent> --target .` / `projects/product/buildr render <agent> --target .` 更新当前 workspace。

- Buildr 产品治理事实只在 `projects/product/` 维护；可执行产品实现分属两个 Service：`projects/product/services/buildr/` 负责 npm package、CLI、本机应用 HTTP/运行时（runtime）、`web-dist` 托管与打包，`projects/product/services/buildr-web/` 负责 Local App React/Vite 权威前端源码与正式构建。当前 workspace 中由 Buildr 交付的资产只能通过当前 Product checkout 的 `update` / `sync` 更新，不直接编辑。

开发阶段执行 Buildr 命令时，使用本 workspace 内的产品 CLI 入口 `projects/product/buildr`，不要依赖本机 PATH 上安装的 `buildr`。

## 产品文档入口

- [README.md](README.md) 是 Buildr 公开产品入口，以产品定位、核心模型、快速开始、当前能力和文档导航为主，最后说明本仓是 Buildr 自举 workspace 及其开发入口。
- [Buildr Product](projects/product/docs/buildr-product.md) 是 Buildr 产品定位、核心模型、边界和 Roadmap 的主说明；产品治理文档维护在 `projects/product/`，CLI、runtime、验证和发布等实现文档维护在 `projects/product/services/buildr/docs/`。涉及产品事实或契约时继续以 Product Project 的 current-state knowledge 和 OpenSpec specs 为准。

## Rule / Skill 分层原则

- Rule = values + boundaries + constraints：控制 Agent 的价值观、边界和约束。
- Skill = reusable professional action：封装可复用的专业动作和操作流程，包含命令、流程、检查和完成标准。
- Skill description = routing index：告诉模型该 Skill 适用于什么用户意图。
- Skill body = loaded playbook：只有匹配后才加载具体做法。
- Agent runtime adapter 只发现和投射 Rule 源，不替 Agent 判断 optional Rule 与当前任务的语义相关性。
- `enabled: true`、`required: true` 且 `state: installed` 的 Rule 必须读取；enabled optional installed Rule 先检查 description，语义相关时在行动前读取正文。
- `enabled: false` 或 `state: uninstalled` 的 Rule 不参与当前任务。

开发 Buildr 时，Rule 不承担 Skill routing，不复述操作手册；场景化流程和经验应优先沉淀为 Skill。Rule description 是 Agent 判断规则语义相关性的索引，不是路径、角色或服务路由表。
