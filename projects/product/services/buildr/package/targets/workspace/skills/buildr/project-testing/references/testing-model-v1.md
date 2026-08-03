# Project Testing Model v1

本 reference 帮助不同技术栈使用同一组测试判断。Project 的真实代码、测试框架和团队约定始终优先。

## 测试边界与编排问题

| 类别 | 第一版取值 | 判断问题 |
| --- | --- | --- |
| 主要意图 | Development、Acceptance、Static Conformance、Delivery / Release | 为什么需要这份证据？ |
| 执行边界 | Static、Unit、Component、Integration、System | 启动了哪些真实边界？ |
| 成本约束 | Quick 或不受 Quick 预算约束 | 是否适合高频反馈？ |
| 选择范围 | focus、affected、full | 本次选择多少证据？ |
| 验证目标 | 开发目标、Candidate、Release artifact | 针对哪个冻结程度和交付物运行？ |

主要意图和执行边界属于测试分类；后三项属于一次编排决策，不要求固化成每个测试的单一场景标签。例如真实 CLI + Git 的完整 Workspace 生命周期可以是 `Development + System`，本次在冻结 Candidate 上按 affected 或 full 范围运行，并不自动成为 Acceptance。

## 执行边界

| 边界 | 第一版定义 |
| --- | --- |
| Static | 只检查源码、schema、manifest、文档或制品结构，不启动被测系统 |
| Unit | 同进程验证一个逻辑单元，协作者被替换，不经过真实进程、网络、数据库或 Workspace 生命周期 |
| Component | 验证一个 Service 的有界组装或轻量上下文，外部系统使用替身、内存实现或受控轻环境 |
| Integration | 穿过真实技术边界，例如子进程 CLI、Git、数据库、HTTP、消息、真实文件系统或容器 |
| System | 从完整交付物或公共入口验证跨组件、跨 Service 或完整生命周期 |

边界按实际启动内容判断，不按目录和框架名字判断。启动 Spring context 的测试在外部系统被替换且范围有界时可以是 Component；连接真实数据库或远端协议时是 Integration。

## 主要意图

- Development：为研发实现提供正确性和回归证据，可以覆盖 Unit 到技术性 System。
- Acceptance：从提案、需求或设计验收标准派生，证明业务目标；执行上通常是 Component、Integration 或 System。
- Static Conformance：证明契约、结构、类型、规范或文档一致性，通常使用 Static。
- Delivery / Release：证明 package、安装、部署、升级、发布或发布后状态；执行上可以是 Integration 或 System。

Browser / Playwright 只是执行手段。技术 smoke 属于 Development / System；只有 requirement-derived case 才属于 Acceptance。

## 编排

| 问题 | 第一版边界 |
| --- | --- |
| Quick | 只组合完整低成本 Static、Unit、Component 和少量轻 Integration；它是成本约束 |
| affected | 根据变更路径、owner 和风险选择所有直接相关证据，包括必要的重型测试 |
| full | 选择 Project 登记的完整回归证据；选择机制自身变化或明确全量要求时使用 |
| Candidate | 表示冻结候选目标；可以承载 affected 或 full，不决定范围 |
| Release | 表示真实发布物节点；组合 package、安装、部署、发布与发布后 smoke |

`focus` 只重跑具体 step 或领域以定位故障，不声明交付完整性。Project 可以提供 `test:candidate` 这类组合入口，但入口名称不得被提升为所有 Candidate 都必须 full 的通用规则。

## Project / Service owner

- Service owner：事实可由一个 Service 的代码、公开技术契约或独立交付物判定。
- Project owner：事实跨 Service、属于 Project 治理资产、用户旅程或组合 Candidate / Release。
- 文件放在 Project 根不改变 Service 事实的 owner；测试实现位置也不应代替部署和交付边界判断。
- 辅助覆盖可以重叠；主门禁按 `primaryEvidenceOwner` 去重。

最小审查卡：

```text
step
→ ownerScope
→ primaryIntent
→ executionBoundary
→ environment/effects
→ targetDuration
→ applicability/proves
→ primaryEvidenceOwner
```

编排再从这些事实决定：哪些低成本步骤进入 Quick、changed inputs 选择哪些 affected owner、哪些步骤构成 full，以及本次验证目标是什么。

`mixed` 只作为“该入口仍需拆分”的审查信号，不是正式测试类型。

## 技术栈映射示例

| 边界 | Node.js 示例 | Java / Spring 示例 |
| --- | --- | --- |
| Static | type/lint、schema、manifest、OpenSpec、package structure | compiler、Checkstyle、ArchUnit、OpenAPI/schema |
| Unit | `node:test` / Vitest / Jest 验证纯函数或类 | JUnit 验证纯 Java 类，协作者 mock/fake |
| Component | 同进程组装一个模块、handler 或轻量 service context | Spring slice 或有界 ApplicationContext，外部系统替换 |
| Integration | child CLI、Git、真实 FS、DB/HTTP/container | Testcontainers、真实 DB、HTTP、消息或跨模块协议 |
| System | 打包 CLI、完整 Workspace、Browser 技术旅程 | 完整应用/服务组合、公共入口、端到端技术生命周期 |

这些是映射示例，不是 Buildr 要求用户安装的框架。引入新技术栈时仍先读取该项目已有工具，再按真实执行边界映射。
