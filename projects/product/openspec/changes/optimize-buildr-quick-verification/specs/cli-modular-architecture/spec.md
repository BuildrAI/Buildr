## MODIFIED Requirements

### Requirement: 产品验证入口必须共享声明与薄执行层
Buildr fast、affected、changed、Workspace/package selectors 和 Candidate entrypoints MUST 共享统一 step registry 与 planner/scheduler，并 MUST 将稳定 shell/npm 表面保持为薄 wrapper。统一 registry MUST 为每个 step 保存可校验的 Project Testing 分类、事实 owner、证明范围和目标成本；Fast 兼容入口 MUST 映射到低成本 Quick 编排，Task-affected、Candidate、Release 与 focus 诊断 MUST 保持各自独立边界。

#### Scenario: 检查验证入口架构
- **WHEN** CLI architecture verifier 扫描产品验证入口
- **THEN** step 命令、预算、依赖、group/profile membership 与 Project Testing 分类 MUST NOT 在多个入口重复维护
- **AND** wrapper MUST 只负责参数转交、环境前置检查和退出状态传播

#### Scenario: 专项 selector 保持兼容
- **WHEN** 维护者使用已有 affected group、Workspace suite 或 package selector
- **THEN** selector MUST 解析为统一 registry 中的稳定 step identity
- **AND** 未知或重复 selector MUST 保持 fail-closed 与去重行为

#### Scenario: Fast 兼容入口执行 Quick
- **WHEN** 维护者运行 `npm test` 或 `npm run test:fast`
- **THEN** planner MUST 完整选择登记为 Quick 的低成本 Static、Unit 与 Component step，以及明确满足目标成本的少量 Integration step
- **AND** MUST NOT 因历史 step id、目录或 `fast` 名称把真实 Workspace、Git、进程生命周期或 System 测试整体纳入 Quick

#### Scenario: 重型 Integration 退出 Quick
- **WHEN** 一个 Integration step 的实际调用包含大量真实 CLI、Git、文件系统或 Workspace fixture，且不满足登记的 Quick 成本目标
- **THEN** registry MUST 保留该 step 的 Task-affected、Candidate 与 focus 可选择性
- **AND** Fast 兼容入口 MUST NOT 默认执行该 step，Candidate MUST NOT 因此缩小完整覆盖

#### Scenario: Registry 分类不完整
- **WHEN** 任一 step 缺少 owner、主要意图、执行边界、编排场景、证明范围、主要证据 owner 或有效目标耗时
- **THEN** registry validation MUST 在启动 verifier 前 fail closed
- **AND** MUST NOT 根据 step id、目录名或 executor 类型补猜分类
