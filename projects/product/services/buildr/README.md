# Buildr

中文 | [English](https://github.com/BuildrAI/Buildr/blob/main/README.en.md)

## 让 Agent 接着已有积累，把工作持续推进下去

当项目背景散在聊天、人的经验和多个代码仓里，Agent 每换一次任务或工具就得重新理解；团队做过的判断、流程和项目关系也很难继续复用。Buildr 把这些工作事实和工作方法组织成 Agent 可持续使用的工作资产。

你可以用 Buildr：组织现有业务与代码仓、让 Agent 基于项目事实继续一项长期工作、把验证过的工作方法沉淀下来，或在更换 Agent 后继续使用同一套资产。Buildr 不取代 Agent 的理解、规划和专业执行；它让这些工作有可发现、可诊断、可交接的基础。

## 快速开始：先完成第一项真实工作

把下面这句话交给你正在使用的 Agent：

```text
帮我开始使用 Buildr：检查并安装需要的 Buildr，确认或创建当前 Workspace；用普通语言引导我建立 Project，并只在有代码仓、应用、模块或可执行资产时接入 Service；完成必要的初始化和验证后，问我第一项想推进的真实工作。
```

Agent 会负责 runtime discovery、初始化、doctor 和必要的确定性操作。你的第一次成功不是“已经输入过 init 命令”，而是：你已确认 Workspace、Project、可选 Service，并能直接向 Agent 描述要推进的目标。

也可以打开 Buildr 本机应用（Local App）：添加已有工作空间（Workspace），查看当前项目（Project）与服务（Service）范围，然后点击“用 Agent 开始”。应用只帮助理解范围、维护低风险 metadata、只读查看任务专业事实和生成交接指令；它不创建 repo、不迁移资产，也不在页面内执行专业任务。

### 只需理解三个对象

```text
Workspace → Project → Service（可选）
```

- **Workspace**：你和 Agent 共同工作的顶层目录。
- **Project**：一个业务、产品、系统或长期工作单元。
- **Service**：该 Project 按需管理的代码仓、应用、模块或可执行资产；没有 Service 也可以开始 Project 范围工作。

## 智能体（Agent）与本机应用（Local App）各做什么

智能体负责理解目标、读取相关资产、规划、执行和验证。本机应用负责让人看懂真实的工作空间 / 项目 / 服务范围，受控维护名称与说明，并把规范范围和目标交给智能体。任务详情以“概览、研发、证据、环境”四个一级视图组合任务记录、任务研发、审查、验证与当前机器环境的 Application read model；除任务记录的受控管理外，专业事实保持只读。两条入口读取同一份工作空间源资产，不维护第二套 onboarding 或生命周期状态。

## 手动或技术兜底

当 Agent 无法执行时，再使用下面的确定性入口。Buildr 支持 Node.js `>=24.15.0 <25`；Workspace 受管 runtime 仍使用声明的精确版本：

```bash
npm install --global @buildr-ai/buildr@next
buildr runtime list --json
buildr init --agent <agent> --target . --name <name> --profile <personal|team|company>
buildr app --target .
```

`init --agent` 以最终 doctor 为技术 onboarding 证据；成功后仍应由 Agent 根据真实 Project/Service 状态完成简短交接。深入命令和 runtime 细节见 [CLI Reference](docs/cli-reference.md) 与 [Runtime Adapters](docs/agent-runtime-adapters.md)。

## 当前能力与边界

- 一个 Workspace 可管理多个 Project；每个 Project 可按需管理多个 Service。
- Rules、Skills、Components、Commands、OpenSpec 和 Project/Service 资产可作为长期工作资产治理。
- 支持 claude-code、codex、cursor、qoder、trae、trae-work、workbuddy 等 runtime adapter。
- 当前不提供远程 SaaS、Agent session connector、聊天客户端或自动专业任务执行。

完整产品定位和边界见 [Buildr Product](../../docs/buildr-product.md)，已知限制见 [Known Limitations](docs/known-limitations.md)。
