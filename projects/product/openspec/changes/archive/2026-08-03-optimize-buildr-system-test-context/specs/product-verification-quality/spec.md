## ADDED Requirements

### Requirement: 可复用 System 测试上下文必须共享不可变基线并隔离写入
Buildr Product MUST 允许主要被测事实不包含 Workspace 初始化的高重复 System 测试复用同一运行内的已初始化基线；共享部分 MUST 保持不可变，每个 test case MUST 在独立可写 sandbox 中执行，且验证初始化、全局状态或完整生命周期本身的测试 MUST 保持独立环境 owner。

#### Scenario: System suite 复用同一上下文
- **WHEN** 一个 `test:system` invocation 包含多个声明使用相同 context identity 的测试文件
- **THEN** runner MUST 对该 identity 最多准备一次基线并把它交给对应 worker
- **AND** 基线 MUST 只包含这些测试共同需要且不是主要被测目标的前置事实

#### Scenario: 并发 test case 修改工作区
- **WHEN** 两个或更多 test case 并发使用同一基线
- **THEN** 每个 case MUST 获得 realpath 不同的可写 sandbox
- **AND** 任一 case 的修改 MUST NOT 改变基线或其他 case 的可见状态

#### Scenario: 基线缺失或被污染
- **WHEN** runner 提供的 context marker、路径边界或内容 identity 缺失、不匹配或在运行中发生变化
- **THEN** System verification MUST fail closed 并报告 context diagnostic
- **AND** worker MUST NOT 静默创建替代基线后继续冒充 suite context 成功

#### Scenario: 直接运行单个测试文件
- **WHEN** 维护者不经过 System runner 直接执行一个已接入 context 的 test file
- **THEN** 该 worker MUST 在本进程内最多准备一次等价基线
- **AND** 所有 case 完成或失败后 MUST 清理该本地基线和各自 sandbox

#### Scenario: 测试以初始化或全局生命周期为主要事实
- **WHEN** System 测试验证 Workspace init、Project/Service 创建、真实 Git/Task Environment、安装、迁移、cleanup 或 Task Finish 交付生命周期
- **THEN** 该测试 MUST 保留自身完整隔离环境
- **AND** runner MUST NOT 用预建结果跳过其主要被测边界
