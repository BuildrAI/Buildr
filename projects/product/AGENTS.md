# AGENTS.md

Agent 在 `product` Project 中的最小运行规则。

## 项目定位

本文件是 Project scope 规则。开始产品任务时，先遵循 Buildr root `AGENTS.md` 中的内联核心规则，再读取本文件。

当前 Project 是 Buildr 自举 workspace 的产品 Project：`projects/product/`。这里维护 Buildr 产品本身，不是用户 workspace。

所有回复、文档、提案、规格、任务说明和面向用户的文本默认使用中文；代码标识、命令、文件路径、协议字段、第三方专有名词或必须保持原文的格式关键字可以使用英文。

新建或重写文本文件时，文件末尾只保留一个换行符，不保留空白行。该约定只属于 Buildr Product 源码树，不由随包 Core 强加给用户 Workspace。

## 资产边界

| 对象 | 位置 | 说明 |
|------|------|------|
| Project rules | `AGENTS.md` | 当前 Product Project 的 Agent 工作规则 |
| OpenSpec | `openspec/` | Buildr 产品事实、能力规范、变更和归档 |
| Product docs | `docs/` | 产品定位、设计说明、发布和维护文档 |
| Package assets | `services/buildr/resources/` | 随包 manifest、workspace/runtime 文件源资产 |
| Buildr 可执行实现 | `services/buildr/` | npm package、CLI、Buildr Web Runtime、`web-dist` 托管与打包、验证及维护脚本的实现根 |
| Buildr Web 前端源码 | `services/buildr-web/` | Buildr Web Frontend Service 的 React/Vite 权威前端源码与正式构建 |
| Compatibility bridge | `buildr` | 只加载 `services/buildr/bin/buildr.mjs` 的稳定开发入口 |
| Service registry | `services/manifest.yml` | 当前 Product Project 的 Service registry |
| Service assets | `services/<service>/` | Service 实现目录；是否独立 Git repo 以 registry source 和实际 Git 边界为准 |

## 产品边界

- 随包 [内联核心规则](services/buildr/resources/workspace/AGENTS.md) 是 Buildr 产品设计与用户 Workspace 工作方式共同遵守的核心产品哲学和通用硬边界；产品能力、Rule、Skill、workflow 和 gate 不得与其冲突。`docs/buildr-product.md` 在该边界内展开产品定位、核心模型和 Roadmap，OpenSpec 继续作为具体可观察行为的规范 authority。
- 新增产品能力必须说明长期治理、跨智能体（Agent）复用、确定性约束或可验证诊断价值；理解目标、推理和专业执行继续由智能体（Agent）负责。人应能低门槛参与，无需掌握内部模型或命令。
- 新增或收紧硬门禁时，必须说明它保护的 authority 或结果不变量，以及放行会产生的具体伤害。缺失的若只是辅助 provenance、推荐流程、工具偏好或自动化信心，而当前事实仍可被检查、验证并诚实报告，则应提供诊断和 Agent 指引，不得阻断无关工作；Buildr 约束结果和副作用边界，不规定 Agent 或协作者必须采用唯一工作方式。
- 新增或调整产品能力时，必须同时考虑 Buildr Skill 如何让 Agent 发现、理解、选择并正确使用该能力；缺少相应的 Agent 使用指引、决策边界或完成标准时，功能设计不完整。
- Task-scoped OpenSpec Change 是产品能力、CLI 行为、上下文模型、runtime adapter 行为和架构性变更的规范 authority；不得用实现、普通文档或 Rule 替代该 Change。
- `services/buildr/resources/manifest.yml` 声明发布边界；`services/buildr/resources/workspace/` 只放映射到用户 workspace 或 Project 的源，`services/buildr/resources/runtime/` 只放直接安装到 Agent runtime 的源。
- `services/buildr/resources/` 是文件型交付资源 authority；工程实现属于 `tools/`，普通生成结果属于被 Git 忽略的 `build/`，前端构建兼托管产物属于被 Git 忽略的 `web-dist/`。修改时必须同时核对初始化、更新、安装与发布边界。
- 未集成的产品候选只在已核对归属的隔离工作目录中执行；不得从候选工作目录更新保留的自举工作空间（Workspace）或共享用户运行时（Runtime）。
- `verification.yml` 是 Product 验证能力、适用性和证明范围的声明 authority；Task Verification Application 是正式验证 current Result 的唯一 authority。普通收尾依据与当前内容相符的真实验证及交付事实报告，不得把普通命令、commit 或 push 冒充正式验证结果。
- 收尾不得伪造验证或交付事实；任务结果登记、Git 交付、环境激活和资源清理保持独立。用户说“收尾”不授权 force push、merge commit、远端任务分支删除、丢弃改动或语义冲突决策。
- self-bootstrap activation 只由 root Rule 指定的唯一 owner 执行；Product Rule 不复制其路径分类、安装、CLI identity 或 Doctor 流程。
- release tag、npm publication、GitHub Release 和其他发布副作用必须单独获得明确授权；`buildr-release` 是发布动作 owner，当前流程知识入口是 `knowledge/flows/open-source-release.md`，本 Rule 不授权或编排发布动作。
- 私有业务 workspace、私有业务规则和私有服务内容不得进入 `resources/` 或正式发布物。
