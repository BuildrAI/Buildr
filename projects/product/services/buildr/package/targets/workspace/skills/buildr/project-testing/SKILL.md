---
name: project-testing
description: 用户要求为 Project 或 Service 设计、梳理或优化测试框架，划分 Static、Unit、Component、Integration、System 边界，区分测试成本、affected/full 范围与 Candidate/Release 验证目标，或实现功能后开发适量测试时使用；不用于执行正式 Task Verification、维护 verification.yml 或记录 Verification Result。
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

## 2. 分开判断测试边界与编排

测试本身分别判断：

1. 主要意图：Development、Acceptance、Static Conformance、Delivery / Release；
2. 执行边界：Static、Unit、Component、Integration、System。

编排另外回答三个独立问题：

1. 成本约束：是否进入可高频运行的 Quick；
2. 选择范围：本次是显式 focus、按影响面选择 affected，还是完整选择 full；
3. 验证目标：运行在开发中的目标、冻结 Candidate，还是 Release artifact。

Quick、affected/full、Candidate/Release 不是同一层级的测试类型或互斥场景。冻结 Candidate 可以执行 affected，也可以在明确需要时执行 full。`System` 不等于 Acceptance；只有从提案、需求或设计验收标准派生的业务证据才是 Acceptance。`Static` 是独立执行形式。`focus` 只用于失败诊断和定向选择，不表示交付完整性。

Service 负责自身代码、公开技术契约和独立交付物可判定的事实；Project 负责跨 Service 行为、治理资产、用户旅程及组合 Candidate / Release。辅助证据可以重叠，但每项关键事实只保留一个 `primaryEvidenceOwner`。

## 3. 为任务设计和开发测试

先为每项关键待证明事实建立最小质量闭环：

1. 写出事实 owner 对外可观察的正确结果，不用内部调用或覆盖率数字代替行为；
2. 按当前变更风险选择能区分正确与错误实现的正常、失败、边界和必要状态转换案例，不机械穷举不适用类别；
3. 再选择能够证明这些结果的最低充分执行边界，并让每个测试的失败含义可独立定位；
4. 实现后检查测试是否能在目标错误存在时失败，无法取得可信反例时明确报告替代证据和 gap。

功能实现后，按最低充分边界补充 Development Tests：

- 纯逻辑优先 Unit，并让完整 Unit suite 保持可被任何变更高频运行；
- 单一有界组装或轻量上下文优先 Component，外部系统使用替身或内存实现；
- 真实进程、Git、数据库、HTTP、消息或文件系统协议使用 Integration；
- 只有完整交付物、公共入口或跨组件生命周期才使用 System。

先复用项目已有工具和 fixture；新增测试应断言返回值、状态变化、输出协议和公开副作用等公共行为，并由最接近实现的 owner 维护。mock、fake 或内存实现只隔离外部协作者或不属于当前主要事实 owner 的边界，不复制被测算法后验证自身；只有交互协议本身属于待证明契约时才断言调用参数、顺序或次数。不要为了目录整齐迁移无关测试，也不要用一个重型 System 测试替代本可低成本证明的 Unit / Component 事实。

Bug 回归测试说明它捕获的旧错误，并在安全、低成本且可复现时证明测试会在修复前、受控错误实现或移除修复后失败。旧行为无法安全执行时，使用当前失败复现、受控替代实现或精确人工推导作为替代证据并报告 gap；不得为取得红灯证据执行越权或破坏性操作，也不得伪造失败历史。

修改被多个action、状态或公共入口复用的validation/helper时，先枚举真实调用面并核对各入口既有错误类型、诊断顺序与公共结果；再结合已有tests和Project `plan-only`/`dry-run` changed-plan reasons，选择至少一个能区分主要兼容回归、成本最低的既有canary。一个canary不能覆盖已识别的独立公共边界时，按最低充分原则扩大focused regression；不得为固定低耗时遗漏已知路径。该反馈属于Development，不能把plan preview或canary结果冒充Task Verification Result，也不替代最终affected Formal Verification。

测试涉及文件、数据库、消息、缓存、全局配置或其他状态与副作用时，按风险检查隔离、必要幂等、失败后清理和重复运行。纯逻辑测试不机械承担这些检查。

提案或设计存在明确验收标准时，可以先识别 Acceptance cases 和未来自动化边界。第一版不自动建设浏览器、移动端、性能、安全或其他 QA 平台；没有实际执行事实时不得宣称业务验收完成。

## 4. 编排开发与交付反馈

- Quick 是成本受限的反馈组合：完整低成本 Static + Unit + Component，以及少量确实低成本的 Integration。
- affected 按 changed paths、事实 owner 和风险选择当前任务真正受影响的证据；重型但相关的测试不能因不在 Quick 而跳过。
- full 选择 Project 登记的完整回归证据；当 affected 选择机制自身变化或用户明确要求全量回归时使用。
- Candidate 是冻结验证目标，不自动等于 full；普通 Candidate 可以运行 affected，完整回归 Candidate 运行 full。
- Release 以真实发布物为目标，按需组合 package、安装、部署、发布或发布后 smoke。

Project 应为入口记录目标耗时并用实际观测校准。registry 可以用 profile、changed inputs 和独立 capability 表达实际组合，但不要再复制一份把上述概念混为一轴的分类。入口名称与成本不符时，先报告问题，再在当前任务范围内拆分或重编排。

## 5. 与 Task Verification 交接

Project Testing 可以新增或调整项目测试、脚本、registry 和说明，但不写 `verification.yml`。当测试入口已存在且稳定，需要声明、选择、执行或记录正式 Task Result 时，交给 `task-verification`。

测试暂不存在时，明确报告测试建设 gap；不要伪造 capability。Task Verification 发现的 coverage gap 如需开发测试，也回到本 Skill 或后续实现任务处理。

## 输出

简洁说明：待证明事实及公共可观察结果、关键案例与遗漏理由、owner、测试意图、执行边界、已有入口、实际成本、affected/full 选择、验证目标、新增测试的有效性证据，以及仍存在的 gap。分析请求只给建议；实现请求才修改当前任务授权内的项目资产。
