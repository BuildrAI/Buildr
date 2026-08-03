---
name: task-triage
description: 用户提出修复、实现、重构、优化、文档/测试或契约语义调整，或询问任务应走代码修改、当前事实维护还是 OpenSpec Change 时使用。
---

# Task Triage Skill

本 Skill 只核对任务事实、作出正交决策并交接专业动作；不复制 Task Environment、任务看板、OpenSpec 或验证手册，也不建立确定性路由器。

## 1. 核对任务事实

只读任务相关范围，不做全量审计。确认：

- 用户希望外部行为或长期事实如何变化；
- 相关 canonical specs、current knowledge、active Changes、实现、测试与 registries，以及其中的事实 authority；
- 完整 Git repository set，使用 Workspace/Project/Service selector，不按目录层级猜测边界；
- 写入授权、不可逆影响和仍需用户决定的语义冲突。

authority 冲突、授权或 repository set 不明、不可逆行为缺少决定，或是否进入实现仍未知时，停止对应写入，只询问会改变长期语义、责任边界或授权的最少问题。

## 2. 三轴决策

### 语义治理

| 选择 | 判定 | 动作 |
|---|---|---|
| `code-only` | canonical spec 已覆盖目标，且修改不改变可观察契约 | 不创建 Change |
| `spec-maintenance` | specs、实现、registries 或已确认决定已证明当前事实，只需文档追上事实 | 不补造 Change；current knowledge 使用 `maintain` |
| `change-flow` | 改变 SHALL/MUST、API、状态流、权限、业务规则、数据语义、兼容性或其他可观察承诺 | 一个独立业务目标一个 Change |
| `blocked` | authority、业务语义或授权无法确认 | 报告冲突和最少决策问题 |

工程细节默认不进入 OpenSpec；但默认值、存储或内部机制一旦改变外部行为、数据含义、兼容性、安全边界或业务承诺，仍走 `change-flow`。不得用 `spec-maintenance` 绕过新需求评审，也不得用 `code-only` 掩盖规范缺失或事实不明。

### 执行形态

- `implementation`：修改代码、运行构建/测试，或需要长期开发上下文。
- `metadata-only`：仅维护 OpenSpec artifacts、Rules、Skills、文档或模板，不进入代码、构建或测试。
- `unknown`：信息不足；先澄清，不提前写 Change artifacts 或当前事实。

该轴独立于语义治理：正式持久交付都需要 Task Environment；`metadata-only` 可以使用共享执行根，不必创建 Git worktree；进入实现时仍复用同一 Receipt 或由 Environment 确定性恢复。

### 任务跟踪

- `none`：简单、短时、无持续跟踪价值。
- `create-board`：跨批次、Change、服务或团队，存在依赖、长期跟踪、多次用户判断，或用户明确要求任务看板/整体进度。
- `continue-board`：已存在同一 Project task identity 的任务看板。

任务看板以 Project task identity 为主，OpenSpec Changes 是 `0..N` 个真实关联。复杂 `code-only` 任务可以在没有 Change 时创建看板；不得为了看板格式创建虚假 Change 或用 planned name 冒充关联。

## 3. 条件化交接

执行前读取相应 optional binding、contract 和 selected provider；provider 不 ready 时只阻塞或降级对应分支，保留其他已确认结论。

| 分支 | Capability / 动作 | 必要输入与成功证据 | 失败处理 |
|---|---|---|---|
| 正式持久交付 | `buildr.task-record/v1` 的 `create` 或 `inspect` | stable Task ID、title、intent、canonical Workspace 与真实 scope/Change；首次持久交付写入前返回 `created|inspected`、path 和 effects | provider 不 ready 或 blocked 时停止正式交付写入；讨论、只读和 metadata maintenance 不依赖 |
| 正式执行位置 | `buildr.task-environment/v1` 的 `prepare` 或 `inspect` | Task ID、canonical Workspace 与完整 repository set；首次持久交付写入前取得 `ready`、实际 execution roots、validation root 和执行 CLI | 只阻塞 execution；不回退到 cwd 或旧 receipt |
| 独立 current knowledge `spec-maintenance` | `buildr.current-knowledge-maintenance/v2` 的 `maintain` | Project、targets、fact sources、授权、tree identity；返回 `aligned|updated|not-applicable` | `unresolved` 报 authority 冲突；`change-required` 重新进入 `change-flow` |
| `create-board|continue-board` | `buildr.task-board-maintenance/v1` | task identity、真实 Change ids 或 `none`；返回 `created|updated|aligned`、路径和时间 | `blocked` 只影响 tracking |

正式持久交付包括代码、文档、配置、Rule、Skill、OpenSpec Change、验证声明或其他准备交付的持久变化。已有 Task Record 或 Local App 已创建时先 inspect 并核对 intent/scope，不重复 create；本次动作仅维护已有生命周期 metadata 时不递归创建新 Task，也不要求重新准备已清理的 Environment。Task Record provider 不可用时不得手写 YAML 代替。其他 provider 不可用时只阻塞对应分支：本 Skill 只选择专业动作；Environment 的准备、恢复和清理由 selected provider 负责。current knowledge provider 不可用时，不得回退为无 evidence 的直接编辑或伪造 Change；看板 provider 不可用时，不得把文件存在冒充创建成功。

选择 `change-flow` 时，先确保正式 Task Record，再完成执行位置判断并使用适用的 `openspec-*` Skill。首次采用、状态实质变化、暂停、完成或用户询问时，从 CLI 刷新并报告 change id、resolved path、action、status、progress 和 next action/blocker；未创建时只写 `planned`，不猜测路径或进度。Buildr 自有 artifacts 和用户说明正文使用中文；命令、路径、标识符、协议字段与 OpenSpec 格式关键字可保留英文。

实现型任务按共享实现区域、验证入口或失败影响面分组：实现中选择直接相关的已有 capability 做反馈；全部内容和 review 修订完成后，由 selected `buildr.task-verification/v3` provider 针对明确 target 选择适用能力、执行 transient verification 并维护 current Task Result。triage 不声明该 dependency，也不预设 minimal/affected/candidate 层级；provider 暂时不可用不改变任务分流结论。

<!-- buildr:skill-contributions change-ready -->

## 4. 输出契约

```text
任务分流：
- 语义治理：code-only / spec-maintenance / change-flow / blocked
- 执行形态：implementation / metadata-only / unknown
- Repository set：<selectors 或 unresolved>
- Task Record：create / inspect / none / blocked
- Task Environment：prepare / inspect / none / blocked
- 任务跟踪：none / create-board / continue-board / blocked
- 事实依据：<最小 authority/evidence>
- 未决事项：<none 或冲突/授权问题>
- 下一动作：<selected capability/provider action 或用户决定>
```

只有选中 OpenSpec 或任务看板时追加对应状态。不得把 readiness、planned identity、文件存在或单次 finding 冒充行为成功。

## Guardrails

- 不为过去事实补造 Change 历史，不把任务看板或 current knowledge 变成第二套规范。
- 不在正式 Task 的首次持久交付写入后才补做 Task Record 或 Task Environment 决策。
- 不使用未经 authority 或 CLI 确认的路径、状态、进度和完成结论。
- 不把一次集中验证解释为覆盖尚未执行、stale 或存在 coverage gap 的适用 delivery-required capability。
