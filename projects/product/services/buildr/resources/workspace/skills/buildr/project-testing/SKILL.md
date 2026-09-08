---
name: project-testing
description: 用户要求为Project或Service设计、梳理或优化测试框架，划分Static、Unit、Component、Integration、System边界，区分测试成本、affected/full范围与Candidate/Release验证目标，或实现功能后开发适量测试时使用；不用于执行正式Task Verification、维护verification.yml或记录任务验证报告。
---

# Project Testing Skill

本 Skill 指导 Agent 理解 Project / Service 的测试框架，并在当前任务授权内设计或开发测试。它没有 Result、Receipt、Application、provider contract 或自身持久状态；长期事实只进入项目已有测试、脚本、CI、registry 或文档。

项目已有约定优先。需要设计测试体系、重新分类或澄清边界时，读取 [测试模型](references/testing-model-v1.md)；普通实现只读取当前相关入口，不为套用模型加载全部材料。

## 1. 先读取真实项目

核对当前变更、待证明事实和风险，再读取相关 Project / Service 的：

- 技术栈、源码边界和可独立交付物；
- 已有测试目录、fixture、package/POM scripts、CI 与测试文档；
- 各入口真实调用、环境、副作用、近期耗时和失败定位能力；
- Project / Service owner，以及已有 `verification.yml` 公开了哪些稳定能力。

不要按文件名、`fast`、`unit` 或技术栈惯例猜执行成本和覆盖。没有现成框架时，只在当前实现任务确实需要且授权允许时建立最小测试入口，不借机建设通用平台。

## 2. 确定最低充分边界

先写明待证明的公共结果，再按风险选择：主要意图为 Development、Acceptance、Static Conformance、Delivery / Release；执行边界为 Static、Unit、Component、Integration、System。Quick、affected/full、Candidate/Release 不是同一层级，分别说明成本约束、选择范围与验证目标；`System` 不等于 Acceptance，`focus` 只用于失败诊断和定向选择。具体定义见测试模型。项目（Project）与服务（Service）的主要事实只保留一个 `primaryEvidenceOwner`，辅助覆盖可以重叠。

可逆、低影响且已有检查足以覆盖的文字或配置整理，不新增只复述实现的测试。已有检查通过后，只有新改动、失败或明确未解决风险才扩大或重复验证；项目必需检查仍须完成。

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

修改被多个action、状态或公共入口复用的validation/helper时，先枚举真实调用面并核对各入口既有错误类型、诊断顺序与公共结果；再结合已有tests和项目现有changed-plan理由，选择至少一个能区分主要兼容回归、成本最低的既有canary。一个canary不能覆盖已识别的独立公共边界时，按最低充分原则扩大focused regression；不得为固定低耗时遗漏已知路径。该反馈属于Development，不能把临时canary结果冒充开发完成后的任务验证报告。

测试涉及文件、数据库、消息、缓存、全局配置或其他状态与副作用时，按风险检查隔离、必要幂等、失败后清理和重复运行。纯逻辑测试不机械承担这些检查。

提案或设计存在明确验收标准时，可以先识别 Acceptance cases 和未来自动化边界。第一版不自动建设浏览器、移动端、性能、安全或其他 QA 平台；没有实际执行事实时不得宣称业务验收完成。

## 4. 编排开发与交付反馈

依照测试模型区分低成本反馈（Quick）、受影响范围（affected）、完整回归（full）、候选（Candidate）与发布物（Release artifact）。必要的重型测试不能因不在低成本组合中而跳过；普通实现不自动升级为发布验证。

按当前入口及实际耗时选择本次需要的证据。入口名称与成本不符时，在当前任务范围内提出或完成调整，不复制第二套分类清单。

## 5. 与 Task Verification 交接

Project Testing 可以新增或调整项目测试、脚本、registry 和说明，但不写 `verification.yml`。当测试入口已存在且稳定，需要声明、选择、执行或记录正式 Task Result 时，交给 `task-verification`。

测试暂不存在时，明确报告测试建设 gap；不要伪造 capability。Task Verification 发现的 coverage gap 如需开发测试，也回到本 Skill 或后续实现任务处理。

## 输出

说明已证明的结果、采用的检查及范围、实际成本和未覆盖项；新增测试时补充它捕获的错误。详细分类只在框架设计或存在歧义时展开。分析请求只给建议；实现请求才修改当前任务授权内的项目资产。
