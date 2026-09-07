# Buildr 门禁分类与有界审计

本文把 Buildr Core 的“宽而薄”治理落到统一审查语言，并记录本轮治理迁移的有界输入。行为 authority 是 canonical `governance-gate-taxonomy` spec；本文不是运行时 gate registry、生命周期状态、完成清单或 Parent progress authority。

## 分类契约

- **硬门禁（Hard Gate / blocked）**：继续一个具体动作会破坏真实结果不变量，例如越权、写错对象、产生未经授权或不可逆副作用、覆盖他人工作、伪造证据或误报完成。
- **待处理（Attention）**：当前结果或可独立核验事实仍成立，但存在需要单独恢复、补登记或跟进的问题；不得据此撤销已经成立的专业事实。
- **建议（Advice）**：改进效率、质量或体验的推荐，不构成动作许可。
- **动作局部就绪（Action-local Readiness）**：`ready|required|blocked` 必须回答具体 consumer 的具体 action 是否具备必要事实；它不是 Workspace、Task 或 Agent 的全局许可位。

新增、保留或收紧硬门禁时，至少回答以下八项：

| 字段 | 必须回答的问题 |
| --- | --- |
| `action` | 哪个具体动作将被阻止？ |
| `consumer` | 谁实际消费这项事实或能力？ |
| `invariant` | 必须保护的结果不变量是什么？ |
| `harm` | 放行会造成什么具体伤害？ |
| `authority` | 哪个专业 owner 或外部事实有权判断？ |
| `scope` | 阻塞只覆盖哪些对象和动作？ |
| `fallback` | Buildr 不可用时，怎样缩小动作、停止副作用或从同等 authority 独立核验？ |
| `classification` | 最终是 `blocked`、`attention` 还是 `advice`？ |

无法说明具体 `harm` 的规则不得成为硬门禁。安全 fallback 不能接受 claimed success、绕过授权、猜测 identity、改写共享历史或删除 ownership 不明的对象。

## 有界审计清单

审计范围限于当前治理 Parent 的代表性入口、能力 readiness 与高风险副作用边界。`当前判断` 是迁移建议，不表示对应模块已经完成重构。

| gate / source | action | consumer | invariant / harm | authority | scope | fallback | 当前判断 | 后续 owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Doctor 聚合 `health.ready` | Agent 的所有工作 | Doctor / Agent | 聚合健康不是所有专业动作的共同 authority，作为总许可会扩大局部故障 | 各 Diagnostic owner | 只约束实际消费故障组件的动作 | 返回分项 blocked/attention/advice，保留不相关动作 | 聚合值不得成为全局 Hard Gate | `doctor-sync-isolation` |
| required capability provider 不可用或 identity 不一致 | 调用该 capability | Capability routing consumer | 放行会调用未知或不匹配 provider | capability contract + selected binding | 当前 capability consumer | 修复 binding 或选择已授权 provider；不影响不消费该 capability 的动作 | Hard Gate，动作局部 | `doctor-sync-isolation`、对应专业 Contribution |
| optional capability 不可用 | 使用增强能力 | Capability routing consumer | 核心结果仍可由基础路径成立，阻断会把增强项变成许可 | capability contract | 仅增强路径 | degraded/advice，使用基础路径并诚实报告缺失 | Advice 或 Attention | `doctor-sync-isolation` |
| 路径 ownership、授权、共享历史或不可逆删除无法证明 | 写入、push、覆盖或删除 | Git / resource / asset writers | 放行会越权、覆盖他人工作或造成不可恢复损失 | Git、filesystem ownership与具体资源authority | 当前高风险副作用 | 停止；精确解析目标和ownership，必要时请求授权 | Hard Gate，保留 | 各专业owner |

## 代表性证明与迁移边界

当前证明集中在capability routing和具体Git、资源、数据删除副作用。测试断言结构化结果与不变量，不把聚合流程状态当作统一门禁。

后续 Contribution 按表中 owner 迁移各自模块，并在实现处保留专业 closed Result；不得为统一术语新增全局 evaluator、SQLite gate 表或第二套进度 authority。最终 Parent acceptance 才检查跨模块一致性。
