# Buildr

中文 | [English](README.en.md)

## Buildr，Agent 的工作基础设施

限制 Agent 工作结果的，不只是模型能力，还有它能拿到什么、能不能接着已有积累继续做。

Buildr 是 Agent 的工作基础设施。它把个人和组织的工作事实与工作方法沉淀为工作资产，让 Agent 可以接着已有积累，把事情从想法持续推进到交付。

**让组织的工作方式，成为所有 Agent 的共同能力。**

Agent 可用的工作事实覆盖得越广，能做的就越多；经过验证的工作方法积累得越多，工作就越稳、越好。

你指挥，Agent 构建；资产归你，Agent 可换。

## 快速开始：只需三步

### 1. 安装或更新 Buildr

把这份 README 发给 Agent，然后说“帮我安装 Buildr”，或者手动执行：

```bash
npm install --global @buildr-ai/buildr@next
```

如需 Buildr Web 本机入口：

```bash
buildr web launcher install
```

已经安装过时，直接告诉 Agent“帮我更新 Buildr”。

### 2. 初始化或更新 Workspace

进入你的工作目录，对 Agent 说：

```text
用 Buildr 管理这个工作空间。
```

已有 Workspace 则说：

```text
帮我更新这个 Workspace。
```

初始化或更新 Workspace 时，Buildr 会同时为当前 Agent 安装或更新 Buildr Skill。

更新 Buildr 是更新本机产品；更新 Workspace 是更新工作资产和 Agent runtime，两者互不代替。

### 3. 直接开始工作

Workspace 准备好后，继续在 Agent 对话框里描述真实目标：

```text
帮我梳理支付产品的需求，并建立项目。
```

```text
为这个需求形成方案，完成开发、测试和交付。
```

你不需要先学习 Buildr 命令。Agent 会使用 Buildr 管理工作资产，然后继续实际工作。

## 三个核心价值

### 1. 一个 Agent 窗口，从产品到发布

一个需求可以持续基于同一套工作资产，从 PRD、设计、开发、测试一路推进到 CI/CD 和上线。

如果每一步都要重新解释背景、搬运文档，Agent 就不可能稳定完成整件事。Buildr 让 Agent 完成当前阶段后，直接基于已有事实和方法进入下一阶段。

**Buildr 自己已经跑通这条链路**：从讨论、OpenSpec 提案到开发实现、测试，再到 Git、GitHub Actions 和 npm 发布，都在同一个 Agent 窗口里完成。

团队协作也一样：产品在项目（Project）中维护 PRD、Specs 和项目事实；内容发生变化后，设计、开发和测试的 Agent 后续都从更新后的事实继续工作。

### 2. 资产归你，Agent 随便换

不同团队、不同任务会用不同 Agent。如果把规则和技能绑死在某个 Agent 里，换 Agent 就得从头迁移一遍。

Buildr 不是另一个 Agent，也不和 Agent 抢活。它把 Agent 干活需要的工作资产和入口准备好，再把工作交给 Agent。工作资产保存在独立的工作空间（Workspace）中，由个人或组织掌控；换的是 Agent，不是你积累的东西。

目前已适配 7 种 Agent，资产一套，入口不同。

### 3. 人和团队变了，资产还在

关键的工作方法、项目事实如果只存在个人经验、本机文件或聊天记录里，人员变动就没了。后来的人再强，也得重新理解项目、试错、建立方法。

Buildr 把工作资产保存在文件系统中，可使用 Git 管理。个人可以跨任务、跨项目复用自己的方法；团队和组织也不会因为人员变化失去已经积累的项目事实、规则和技能。后来的人通过 Agent，可以更快在已有基础上继续工作。

## Buildr 如何工作

Buildr 把工作方法和工作事实，组织成 Agent 可发现、可选择、可使用的工作资产：

- **工作方法**：怎么干活——规则、技能、命令，是个人或组织完成工作的能力
- **工作事实**：干的是什么——项目文档、Specs、服务信息、代码仓库，以及它们之间的关系

人指挥 Agent，Agent 管理资产：

```text
你说“把团队的发布流程整理成 Skill”
  → Agent 通过 Buildr Skill 理解意图
    → 调用 Buildr CLI 执行
      → 发布流程沉淀为可复用的 Skill，并渲染到 Agent runtime
```

Agent 使用 Buildr 的核心入口是 **Buildr CLI + Buildr Skill**：

- **Buildr CLI**：负责创建、更新、同步和诊断工作资产
- **Buildr Skill**：告诉 Agent 如何理解目标、选择并验证 Buildr CLI 操作

Buildr 将工作资产的源文件保存在文件系统中，可使用 Git 管理；Agent runtime 由这些源文件渲染生成。核心模型是：

```text
工作空间（Workspace，个人 / 团队 / 企业）
  └── 项目（Project）
        └── 服务（Service）
```

一个 Workspace 的文件系统结构如下：

```text
workspace/
├── rules/                 # Agent 遵守的规则和边界
├── skills/                # 可复用的专业动作和工作流
├── components/            # 一组规则、技能和命令的统一生命周期
├── commands/              # 外部 CLI 的声明与检查
├── projects/
│   └── <project>/
│       ├── 项目文档 · Specs · capabilities.yml
│       └── services/
│           └── <service>/ # 代码仓、应用、模块
└── Agent runtime 入口      # 渲染后的原生入口，可重建，非事实源
```

| 对象 | 说明 |
|------|------|
| 工作空间（Workspace） | 个人、团队或企业的工作目录和 Skill 唯一治理根 |
| 项目（Project） | 业务或产品单元，保存项目事实、Skill applicability、capability bindings 和服务关系 |
| 服务（Service） | 项目使用的代码仓、应用或模块 |

Skill 只在工作空间的 `skills/` 维护，然后 render 到两种 Agent runtime destination：`workspace` 表示当前工作目录可发现，`user` 表示当前用户的所有工作空间可发现。项目不复制 Skill 内容，也不被 Buildr 当作安装隔离层；若某个 Skill 只适用于一个项目，由该项目的 `capabilities.yml` 表达业务适用性。

Buildr 管理的是长期工作资产，不直接填充模型的 context window。Agent 根据当前任务发现和选择相关内容，形成自己的任务上下文。Agent 负责理解、检索、推理和专业执行；Buildr 负责工作资产治理、确定性状态变更、runtime 投射、完整性保护和诊断。

## 当前能力

- 一个工作空间（Workspace）管理多个项目（Project）；每个项目可按需要管理多个服务（Service）
- 规则、工作空间级 Skills、组件和命令等资产的统一管理；Skill 支持 user/workspace destination 与同名冲突预检
- 管理任务（Task）从规划、环境、开发、审查、验证到交付和复盘的过程事实
- Buildr Web：在本机浏览器中查看和管理工作空间、项目、服务、文档、任务、验证与执行记录；当前仍在持续完善
- 支持 7 个 Agent runtime adapter（claude-code、codex、cursor、qoder、trae、trae-work、workbuddy）

详细边界见[已知限制](projects/product/services/buildr/docs/known-limitations.md)。

## 文档

- [日常使用手册](projects/product/docs/manual/README.md)：安装、Workspace 准备和日常工作流程
- [产品说明](projects/product/docs/buildr-product.md)：完整定位、核心模型、边界和 Roadmap
- [Buildr Skill](projects/product/services/buildr/package/targets/runtime/skills/buildr/SKILL.md)：Agent 使用 Buildr 的主要入口
- [CLI Reference](projects/product/services/buildr/docs/cli-reference.md)：公开命令和参数
- [Runtime Adapters](projects/product/services/buildr/docs/agent-runtime-adapters.md)：各 Agent 的接入方式和限制
- [OpenSpec specs](projects/product/openspec/specs/)：规范性产品行为契约

## Buildr 自举 workspace：开发者与协作者

普通用户只需安装 npm 版本，不需要克隆本仓库。参与 Buildr 开发时：

```bash
git clone https://github.com/BuildrAI/Buildr.git
cd Buildr/projects/product
npm ci
./buildr --help
./buildr runtime list --json
```

开发 checkout 使用仓库内的 `projects/product/buildr`，不依赖 PATH 中的全局 `buildr`。Product 治理事实位于 `projects/product/`，CLI 与 runtime 实现在 `services/buildr/`，Buildr Web 前端在 `services/buildr-web/`。

开始修改前请阅读[贡献指南](CONTRIBUTING.md)。

[贡献指南](CONTRIBUTING.md) · [安全报告](SECURITY.md) · [MIT License](LICENSE) · [GitHub Issues](https://github.com/BuildrAI/Buildr/issues)
