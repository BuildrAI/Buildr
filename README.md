# Buildr

中文 | [English](README.en.md)

## Buildr，Agent 的工作基础设施

限制 Agent 工作结果的，不只是模型能力，还有它能拿到什么、能不能接着已有积累继续做。

Buildr 是 Agent 的工作基础设施。它把个人和组织的工作事实与工作方法沉淀为工作资产，让 Agent 可以接着已有积累，把事情从想法持续推进到交付。

**让组织的工作方式，成为所有 Agent 的共同能力。**

Agent 可用的工作事实覆盖得越广，能做的就越多；经过验证的工作方法积累得越多，工作就越稳、越好。

你指挥，Agent 构建；资产归你，Agent 可换。

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

## 快速开始

把这份 README 给 Agent，然后说：

```
用 Buildr 管理这个项目
```

Agent 读到这个任务后，按以下流程完成初始化。本节主要给 Agent 看，人了解流程即可。

**1. 准备 Node.js 和 Buildr CLI**

Buildr 需要 Node.js 24.15.0 或更高版本。先检查 Node.js 版本和本机是否已有 `buildr` 命令；条件不满足时，先询问用户再安装或升级：

- **预发布版（当前推荐试用，当前候选版：`0.1.0-rc.8`）**：`npm install -g @buildr-ai/buildr@next`
- **开发版**：让用户确认保存位置后，执行 `git clone https://github.com/BuildrAI/Buildr.git <path>`，后续使用 `<path>/projects/product/buildr`

下文中的 `buildr` 表示所选入口：预发布版使用全局命令，开发版使用 `<path>/projects/product/buildr`。

**2. 初始化工作空间（Workspace）**

CLI 就绪后，识别当前 Agent runtime 并执行初始化：

```bash
buildr runtime list --json
buildr init --agent <agent> --target . --name <name> --profile <personal|team|company>
```

`init --agent` 会初始化工作空间源资产、准备当前 Agent runtime，并以最终 doctor 通过作为完成条件。

Agent 只有同时满足以下条件，才算初始化完成：

- 工作空间源资产已经创建
- 当前 Agent runtime 已经准备完成
- 最终 doctor 已通过

**3. 告诉 Agent 你想推进的第一项真实工作**

工作空间准备好后，用户不需要先学命令、规则或技能。直接告诉 Agent：你要推进什么、已有些什么、希望先得到什么结果。

Agent 会帮你确认第一项工作，并把它归入一个项目（Project）。项目是长期业务或产品的工作单元，不等同于某一个代码仓；只有确实需要管理代码仓、应用或模块时，才把它们接入为服务（Service）。没有服务也可以先推进项目工作。

**Git 不需要一开始就决定。** 工作空间、项目和服务都可以各自使用独立的 Git 仓，也可以从上到下共用同一个 Git 仓。把已有仓库地址、本地目录和希望协作的分支告诉 Agent；它会按真实的 Git 边界处理。不确定时也不用猜，先从目标开始即可。

如果你还不确定该怎么描述，只要先说：

```text
我想开始推进支付能力。请根据我现有的资料，引导我建立项目，并问我下一步最需要做什么。
```

信息明确时，可以这样说：

```text
我想建立“支付”项目：目标是支持线上收款和退款。已有资料和 payment-api 代码仓在 <git-url>；请按实际 Git 边界引导我确认项目和服务，并先梳理支付流程。
```

第一项工作不需要很大；关键是让 Agent 从真实目标开始，而不是让你停在“已经初始化”这一步。Agent 通过 Buildr Skill 理解目标，通过 Buildr CLI 执行可确定的资产操作。

Buildr 当前处于预发布阶段，版本和安装来源以 [GitHub Releases](https://github.com/BuildrAI/Buildr/releases) 为准。

## 当前能力

- 一个工作空间（Workspace）管理多个项目（Project）；每个项目可按需要管理多个服务（Service）
- 规则、工作空间级 Skills、组件和命令等资产的统一管理；Skill 支持 user/workspace destination 与同名冲突预检
- 任务（Task）及其过程信息管理，包括任务复盘
- Local App：查看和管理工作空间、项目、服务与任务等信息；当前仍在持续完善
- 支持 7 个 Agent runtime adapter（claude-code、codex、cursor、qoder、trae、trae-work、workbuddy）

详细边界见[已知限制](projects/product/services/buildr/docs/known-limitations.md)。

## 文档

- [产品说明](projects/product/docs/buildr-product.md)：完整定位、核心模型、边界和 Roadmap
- [Buildr Skill](projects/product/services/buildr/package/targets/runtime/skills/buildr/SKILL.md)：Agent 使用 Buildr 的主要入口
- [CLI Reference](projects/product/services/buildr/docs/cli-reference.md)：公开命令和参数
- [Runtime Adapters](projects/product/services/buildr/docs/agent-runtime-adapters.md)：各 Agent 的接入方式和限制
- [OpenSpec specs](projects/product/openspec/specs/)：规范性产品行为契约

## Buildr 自举 workspace

本仓库也是 Buildr 开发自身的 workspace。Product 治理事实维护在 `projects/product/`，可执行产品的唯一源码根是 `projects/product/services/buildr/`；根目录资产是消费状态。

```bash
projects/product/buildr runtime list --json
projects/product/buildr doctor --agent <agent> --target . --json
```

[贡献指南](CONTRIBUTING.md) · [安全报告](SECURITY.md) · [MIT License](LICENSE) · [GitHub Issues](https://github.com/BuildrAI/Buildr/issues)
