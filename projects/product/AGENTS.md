# AGENTS.md

Agent 在 `product` Project 中的最小运行规则。

## 项目定位

本文件是 Project scope 规则。开始产品任务时，先遵循 Buildr root `AGENTS.md` 和 Buildr Core，再读取本文件。

当前 Project 是 Buildr 自举 workspace 的产品 Project：`projects/product/`。这里维护 Buildr 产品本身，不是用户 workspace。

所有回复、文档、提案、规格、任务说明和面向用户的文本默认使用中文；代码标识、命令、文件路径、协议字段、第三方专有名词或必须保持原文的格式关键字可以使用英文。

## 资产边界

| 对象 | 位置 | 说明 |
|------|------|------|
| Project rules | `AGENTS.md` | 当前 Product Project 的 Agent 工作规则 |
| OpenSpec | `openspec/` | Buildr 产品事实、能力规范、变更和归档 |
| Product docs | `docs/` | 产品定位、设计说明、发布和维护文档 |
| Package assets | `services/buildr/package/` | 随包 manifest、bootstrap、workspace/runtime targets |
| Buildr 可执行实现 | `services/buildr/` | npm package、CLI、本机应用 HTTP/运行时（runtime）、`web-dist` 托管与打包、验证及维护脚本的实现根 |
| Local App 前端源码 | `services/buildr-web/` | Local App React/Vite 权威前端源码与正式构建 |
| Compatibility bridge | `buildr` | 只加载 `services/buildr/bin/buildr.mjs` 的稳定开发入口 |
| Service registry | `services/manifest.yml` | 当前 Product Project 的 Service registry |
| Service assets | `services/<service>/` | Service 实现目录；是否独立 Git repo 以 registry source 和实际 Git 边界为准 |

## 产品边界

- 产品定位、核心模型、边界和 Roadmap 以 `docs/buildr-product.md` 为准。
- Buildr 的主要用户是 Agent；人是一等参与者，主要通过 Agent 表达目标、提供业务判断并确认重要决策。产品能力必须优先从 Agent 如何发现、理解和使用组织工作资产的视角设计，同时保证人可以低门槛参与，不能只提供面向人的操作入口与说明。
- 产品交互优先支持 Agent 理解用户意图、自主推理下一步并引导用户使用 Buildr；能够由 Agent 判断、解释和推进的工作，不应要求人类用户先掌握 Buildr 的内部模型或命令细节。
- Buildr 不成为另一个 Agent，也不复制 Agent 的通用理解、推理、规划、对话和专业任务执行能力。新增产品能力必须说明其长期治理、跨 Agent 复用、确定性约束或可验证诊断价值；不具备这些价值时应将工作保留给 Agent，需要复用和治理的专业动作优先沉淀为 Skill 或其他工作方法资产，不得在 Buildr 产品核心中另建推理或任务执行主体。
- 新增或调整产品能力时，必须同时考虑 Buildr Skill 如何让 Agent 发现、理解、选择并正确使用该能力；缺少相应的 Agent 使用指引、决策边界或完成标准时，功能设计不完整。
- Task-scoped OpenSpec Change 是产品能力、CLI 行为、上下文模型、runtime adapter 行为和架构性变更的规范 authority；不得用实现、普通文档或 Rule 替代该 Change。
- `services/buildr/package/manifest.yml` 声明发布边界；`services/buildr/package/targets/workspace/` 只放映射到用户 workspace 或 Project 的源，`services/buildr/package/targets/runtime/` 只放直接安装到 Agent runtime 的源。
- `services/buildr/package/targets/` 和 `services/buildr/package/bootstrap/` 是发布给用户的内容，修改时必须同时从用户初始化、更新和日常使用 Buildr 的视角审视。
- 未集成的 Product candidate 只能存在于 current Task Environment 允许的 execution roots；不得从 candidate checkout 更新 retained 自举 workspace 或共享 user runtime。
- `verification.yml` 是 Product 验证能力、适用性和证明范围的声明 authority；Task Verification Application 是 Task-scoped current Result 的唯一 authority。Git worktree、命令成功、commit 或 push 均不得替代 current Result，交付声明必须绑定最终 Content Target 和 current declaration identities。
- Task Finish 只消费 current Development handoff；不得收敛 OpenSpec/current knowledge、发起 Formal Verification 或 Completion Review、接受风险或改写 Development facts。用户说“收尾”不授权 force push、merge commit、远端任务分支删除、丢弃改动或语义冲突决策。
- self-bootstrap activation 只由 root Rule 指定的唯一 owner 执行；Product Rule 不复制其路径分类、安装、CLI identity 或 Doctor 流程。
- release tag、npm publication、GitHub Release 和其他发布副作用必须单独获得明确授权；`buildr-release` 与 release checklist 是发布流程 owner，本 Rule 不授权或编排发布动作。
- 私有业务 workspace、私有业务规则和私有服务内容不得进入 `package/`。
