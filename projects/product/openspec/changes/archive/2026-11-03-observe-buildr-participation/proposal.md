## Why

Buildr 已统一内部智能体（Agent）的执行入口，但尚不能持续、可靠地回答“这次提供了哪些 Buildr 内容、观察到了哪些读取或调用、带来多少内容开销”。现在可以复用已有发送、工具事件、私有对话库和资产来源核对能力，以少量附加元数据形成单次明细与跨次汇总，替代反复编写一次性历史分析脚本。

任务背景、范围及本轮授权见[任务说明](@task/buildr-participation-observation)。本轮只交付规划，不修改功能实现、安装状态或用户执行配置。

## What Changes

- **执行中自动标记**：在现有发送和工具事件路径记录参与对象、当次能证明的来源与版本、动作、输入输出体积、完整性及原记录引用，不让 Agent 手工填报。
- **分清三种事实**：可发现／已提交的内容、观察到的读取或调用请求、原生明确确认的动作结果。缺少消费信号不解释为零使用，调用和执行结束不解释为价值或目标完成。
- **来源有边界**：区分 Buildr 提供、组织／用户自定义、第三方和未知；不因 Buildr 管理了文件、返回了任务资料或路径包含 `buildr` 就归为 Buildr 方法。
- **复用原记录**：工具元数据附着于原条目，发送元数据关联原输入尝试；不新增独立执行流水或正文仓库。跨次统计使用可重建读侧索引。
- **两个查看视图**：在现有对话中查看单次参与明细，在全局对话入口按明确工作空间、时间、Agent、模型、对象及版本查看汇总，并能回到原始证据。
- **同一只读能力供人和 Agent 使用**：界面和准确绑定的对话控制脚本消费同一查询结果；复用 Buildr Skill 的内部对话指引，不新增每次全量注入的观察教程或独立观察技能。
- **诚实展示开销与覆盖**：工具截断前记录可取得的原生文本长度；无法取得时展示局部长度或未知。保留既有 `contextUsage`，但不将其当作累计账单或按资产分摊。
- **兼容渐进上线**：三家现有执行器采用共同语义，各自只提供能证明的事实；旧记录不回填来源，旧后台或采集失败只影响观察覆盖，不阻断工作。

不包含贡献评分、自动删减规则／技能、自动优化、账单系统、云端遥测、受控对比实验、外部桌面历史导入及 DSH 插件生产者改造。不会恢复历史 `buildr-operation-trace` 工作，也不变更现有 DSH 来源任务。

本变更没有预期的破坏性外部变化：既有执行、工具结果、正文、恢复身份和默认权限保持；新增查询和观察字段采用兼容扩展，不能识别时明确报告不支持。

## Capabilities

### New Capabilities

- `agent-buildr-participation`：内部 Agent 执行中的参与元数据、来源与证据边界、体积和结果口径、幂等保存、单次查询、跨次汇总、界面与 Agent 只读入口，以及兼容、隐私和失败隔离。

### Modified Capabilities

无。`agent-conversations` 的执行与原记录语义、`agent-runtime-connections` 的宿主边界保持；`dsh-buildr-provenance` 继续只约束其原生桌面范围，本变更不将其配置或特有协议强加给其他执行器。

## Impact

| 范围 | 计划变化 |
|---|---|
| `services/buildr-agent/` | 公共观察类型与可选能力、发送和工具事件接线、适配器截断前计量、原记录兼容保存、读侧索引及查询、准确对话控制脚本只读操作 |
| `services/buildr/src/modules/agent-service/` | 可选宿主来源核对装配、认证 HTTP 查询映射；不直接读取 Agent 私有数据库 |
| `services/buildr/src/modules/agent-assets/` | 复用 `source inspect` 的元数据来源核对；仅在已支持范围不足时补充明确来源类型，不新增第二资产登记库 |
| `services/buildr-web/src/features/agent-conversations/` | 单次明细、汇总查看、覆盖说明和原证据导航，保留对话选择、草稿与滚动上下文 |
| `services/buildr/resources/runtime/skills/buildr/references/agent-operations.md` | 实施时补充按需查询方法、解释边界和完成判断；不在本轮改写已交付技能 |
| 测试与验证登记 | 共同契约、厂商差异、来源误判、幂等与重启、统计分母、隐私、权限及真实界面场景；按实际入口维护 `verification.yml` |
| 当前知识 | 实施后校准智能体接入／边界说明及技术层代码地图；本轮仅评估影响，不把拟议能力写成当前事实 |

方案详见 [design.md](design.md)，可验证行为见 [specs/agent-buildr-participation/spec.md](specs/agent-buildr-participation/spec.md)，依赖顺序和验收见 [tasks.md](tasks.md)。
