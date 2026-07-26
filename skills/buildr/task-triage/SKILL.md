---
name: task-triage
description: 用户提出修复、实现、重构、优化、文档/测试或契约语义调整，或询问任务应走代码修改、当前事实维护还是 OpenSpec Change 时使用。
---

# Task Triage Skill

本 Skill 只核对任务事实、作出正交决策并交接专业动作；不复制 worktree、任务看板、OpenSpec 或验证手册，也不建立确定性路由器。

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

该轴独立于语义治理：`code-only + implementation` 仍需要 task environment；`change-flow + metadata-only` 可以不创建 worktree；后来进入实现时重新判断并收敛到唯一环境。

### 任务跟踪

- `none`：简单、短时、无持续跟踪价值。
- `create-board`：跨批次、Change、服务或团队，存在依赖、长期跟踪、多次用户判断，或用户明确要求任务看板/整体进度。
- `continue-board`：已存在同一 Project task identity 的任务看板。

任务看板以 Project task identity 为主，OpenSpec Changes 是 `0..N` 个真实关联。复杂 `code-only` 任务可以在没有 Change 时创建看板；不得为了看板格式创建虚假 Change 或用 planned name 冒充关联。

## 3. 条件化交接

执行前读取相应 optional binding、contract 和 selected provider；provider 不 ready 时只阻塞或降级对应分支，保留其他已确认结论。

| 分支 | Capability / 动作 | 必要输入与成功证据 | 失败处理 |
|---|---|---|---|
| `implementation` | `buildr.task-worktree-lifecycle/v2` | 完整 repository set；在写入前创建或复用 canonical task environment，并用明确 target/workdir、membership 与 checkout-local CLI 取得 `executionReady: true` | 只阻塞 execution |
| 独立 current knowledge `spec-maintenance` | `buildr.current-knowledge-maintenance/v2` 的 `maintain` | Project、targets、fact sources、授权、tree identity；返回 `aligned|updated|not-applicable` | `unresolved` 报 authority 冲突；`change-required` 重新进入 `change-flow` |
| `create-board|continue-board` | `buildr.task-board-maintenance/v1` | task identity、真实 Change ids 或 `none`；返回 `created|updated|aligned`、路径和时间 | `blocked` 只影响 tracking |

本 Skill 只选择位置；创建、doctor、sync、保留和清理由 selected provider 负责。current knowledge provider 不可用时，不得回退为无 evidence 的直接编辑或伪造 Change；看板 provider 不可用时，不得把文件存在冒充创建成功。

选择 `change-flow` 时，先完成执行位置判断，再使用适用的 `openspec-*` Skill。首次采用、状态实质变化、暂停、完成或用户询问时，从 CLI 刷新并报告 change id、resolved path、action、status、progress 和 next action/blocker；未创建时只写 `planned`，不猜测路径或进度。Buildr 自有 artifacts 和用户说明正文使用中文；命令、路径、标识符、协议字段与 OpenSpec 格式关键字可保留英文。

实现型任务按共享实现区域、验证入口或失败影响面分组：单项做最小反馈，组完成后做 affected，全部内容和 review 修订完成后执行最终 required assurance。实际命令、candidate identity、耗时和 evidence 由执行阶段的 selected `buildr.task-verification/v2` provider 负责；triage 不声明该 dependency，规划不因其暂时不可用而 blocked。

<!-- buildr:skill-contributions change-ready -->

## 4. 输出契约

```text
任务分流：
- 语义治理：code-only / spec-maintenance / change-flow / blocked
- 执行形态：implementation / metadata-only / unknown
- Repository set：<selectors 或 unresolved>
- Task environment：create / reuse / none / blocked
- 任务跟踪：none / create-board / continue-board / blocked
- 事实依据：<最小 authority/evidence>
- 未决事项：<none 或冲突/授权问题>
- 下一动作：<selected capability/provider action 或用户决定>
```

只有选中 OpenSpec 或任务看板时追加对应状态。不得把 readiness、planned identity、文件存在或单次 finding 冒充行为成功。

## Guardrails

- 不为过去事实补造 Change 历史，不把任务看板或 current knowledge 变成第二套规范。
- 不在 implementation Change 写入 artifacts 后才补做 task environment 决策。
- 不使用未经 authority 或 CLI 确认的路径、状态、进度和完成结论。
- 不把集中验证解释为跳过最终 required assurance。
