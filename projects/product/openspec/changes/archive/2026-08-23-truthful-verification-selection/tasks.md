## 1. 选择权威拆分

- [x] 1.1 建立独立 ownership module，迁移 step inputs/exclusions、ignore/delegation、production owner allowlist 与语义化 Full 输入，并保持 registry execution graph identity 可验证
- [x] 1.2 让 registry 按 step id 组合 ownership，补齐缺失、重复、未知 step owner 的 fail-closed contract
- [x] 1.3 让 changed planner 对 owner-only、timing/report、声明元数据、package metadata 与 execution semantics 生成结构化 affected/full reason

## 2. Owner gap 与预算准入

- [x] 2.1 将 unmapped path 和 direct production owner gap 改为 verifier 启动前的结构化 blocked plan，删除 Full fallback
- [x] 2.2 计算 step 总目标工作量、全局容量下限、依赖关键路径、资源容量下限、限制性约束与缺失预算覆盖
- [x] 2.3 将估算投影到 changed/Candidate plan JSON 与人类输出，并在声明预算数学上不可行时执行前失败关闭
- [x] 2.4 把当前 Candidate 120 秒失真声明调整为可解释的诚实过渡预算，保留后续 Core/Release 分离后的 180 秒优化目标

## 3. 反例、回放与当前认知

- [x] 3.1 增加 owner-only、registry execution semantics、timing/report-only、verification metadata、package metadata、unknown path 与 production owner gap 的 Unit/System 反例
- [x] 3.2 增加容量、依赖、资源和缺失 step budget 的估算契约，并证明 blocked plan 不启动 admission 或业务 verifier
- [x] 3.3 使用近期代表路径样本回放 affected/full/blocked reason，核对 Candidate step、依赖、资源与 primary evidence coverage 没有迁移损失
- [x] 3.4 更新 Change Brief、knowledge impact 与 `docs/verification-ownership.md`，明确 ownership/execution authority、owner gap 和预算准入当前事实

## 4. 直接验证与收敛准备

- [x] 4.1 运行 registry/planner/changed/timing focused 测试、CLI architecture、package contract 与 Product affected 反馈并修复回归
- [x] 4.2 运行 OpenSpec strict validation 与 convergence preflight，确认 delta、active Change ownership 和 projected canonical specs apply-ready
