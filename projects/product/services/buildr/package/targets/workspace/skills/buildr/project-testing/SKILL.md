---
name: project-testing
description: 用户要求为 Project 或 Service 设计、梳理或优化测试框架，划分 Static、Unit、Component、Integration、System 边界，编排 Quick、Task-affected、Candidate、Release，或实现功能后开发适量测试时使用；不用于执行正式 Task Verification、维护 verification.yml 或记录 Verification Result。
---

# Project Testing Skill

本 Skill 指导 Agent 理解 Project / Service 的测试框架，并在当前任务授权内设计或开发测试。它没有 Result、Receipt、Application、provider contract 或自身持久状态；长期事实只进入项目已有测试、脚本、CI、registry 或文档。

开始行动时必须读取 `references/testing-model-v1.md`。项目已有约定优先；reference 只提供判断框架，不要求固定目录、命令名或测试库。

## 1. 先读取真实项目

核对当前变更、待证明事实和风险，再读取相关 Project / Service 的：

- 技术栈、源码边界和可独立交付物；
- 已有测试目录、fixture、package/POM scripts、CI 与测试文档；
- 各入口真实调用、环境、副作用、近期耗时和失败定位能力；
- Project / Service owner，以及已有 `verification.yml` 公开了哪些稳定能力。

不要按文件名、`fast`、`unit` 或技术栈惯例猜执行成本和覆盖。没有现成框架时，只在当前实现任务确实需要且授权允许时建立最小测试入口，不借机建设通用平台。

## 2. 用三轴确定边界

分别判断，不把三者合成一种层级：

1. 主要意图：Development、Acceptance、Static Conformance、Delivery / Release；
2. 执行边界：Static、Unit、Component、Integration、System；
3. 编排场景：Quick、Task-affected、Candidate、Release。

`System` 不等于 Acceptance；只有从提案、需求或设计验收标准派生的业务证据才是 Acceptance。`Static` 是独立执行形式。`focus` 只用于失败诊断和定向选择，不是交付编排场景。

Service 负责自身代码、公开技术契约和独立交付物可判定的事实；Project 负责跨 Service 行为、治理资产、用户旅程及组合 Candidate / Release。辅助证据可以重叠，但每项关键事实只保留一个 `primaryEvidenceOwner`。

## 3. 为任务开发测试

功能实现后，按最低充分边界补充 Development Tests：

- 纯逻辑优先 Unit，并让完整 Unit suite 保持可被任何变更高频运行；
- 单一有界组装或轻量上下文优先 Component，外部系统使用替身或内存实现；
- 真实进程、Git、数据库、HTTP、消息或文件系统协议使用 Integration；
- 只有完整交付物、公共入口或跨组件生命周期才使用 System。

先复用项目已有工具和 fixture；新增测试应能独立定位失败，并由最接近实现的 owner 维护。不要为了目录整齐迁移无关测试，也不要用一个重型 System 测试替代本可低成本证明的 Unit / Component 事实。

提案或设计存在明确验收标准时，可以先识别 Acceptance cases 和未来自动化边界。第一版不自动建设浏览器、移动端、性能、安全或其他 QA 平台；没有实际执行事实时不得宣称业务验收完成。

## 4. 编排开发与交付反馈

- Quick：完整低成本 Static + Unit + Component，以及少量确实低成本的 Integration；目标是高频反馈。
- Task-affected：按 changed paths、事实 owner 和风险选择当前任务真正受影响的证据；重型但相关的测试不能因不在 Quick 而跳过。
- Candidate：冻结目标后的完整研发回归与 Project policy 要求的 System、交付门禁，不用 diff 缩小覆盖。
- Release：在 Candidate 之上验证 package、安装、部署、发布或发布后 smoke 等真实交付边界。

Project 应为入口记录目标耗时并用实际观测校准。入口名称与成本不符时，先报告问题，再在当前任务范围内拆分或重编排。

## 5. 与 Task Verification 交接

Project Testing 可以新增或调整项目测试、脚本、registry 和说明，但不写 `verification.yml`。当测试入口已存在且稳定，需要声明、选择、执行或记录正式 Task Result 时，交给 `task-verification`。

测试暂不存在时，明确报告测试建设 gap；不要伪造 capability。Task Verification 发现的 coverage gap 如需开发测试，也回到本 Skill 或后续实现任务处理。

## 输出

简洁说明：待证明事实、owner、三轴分类、已有入口、实际成本、当前新增或建议测试、各编排场景以及仍存在的 gap。分析请求只给建议；实现请求才修改当前任务授权内的项目资产。
