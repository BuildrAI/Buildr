## ADDED Requirements

### Requirement: Buildr不得提供统一Task Environment模块

Buildr MUST不提供统一Task Environment Application、Plan、Receipt、ready状态、恢复、资源注册、总cleanup、CLI、HTTP、Web页签或SQLite current。普通编辑、构建、测试、Review、Verification、Finish和交付 MUST不因缺少环境记录而失败。

#### Scenario: 普通任务直接工作
- **WHEN** Agent在已确认Workspace进行普通代码修改且不需要独立Worktree或额外准备
- **THEN** Buildr MUST不创建任何Environment记录
- **AND** Agent MAY直接编辑、构建、测试、Review、Verification与交付

#### Scenario: 局部资源失败
- **WHEN** Preparation、Preview或Worktree cleanup中的具体动作失败
- **THEN** 失败 MUST只影响依赖该动作的工作
- **AND** 已成立的Task结果、Verification、交付或Publication事实 MUST保持成立

## REMOVED Requirements

### Requirement: 正式 Task 必须先取得 ready Task Environment
**Reason**: 统一ready工作许可已删除。

### Requirement: Task Environment 必须记录实际执行位置而非固定 mode
**Reason**: 工作位置直接由当前Workspace或Worktree观察。

### Requirement: Task Validation Workspace 必须隔离候选 runtime 投射
**Reason**: 候选写入保护由runtime projection和具体工具负责。

### Requirement: Task Environment 必须统一编排安全 cleanup
**Reason**: 资源和Worktree由各自owner清理。

### Requirement: Task checkout/provider evidence 必须是 Environment 的源码版本基础
**Reason**: Worktree evidence是独立Git事实。

### Requirement: Retained Environment Manager 必须可信但不得成为源码版本 authority
**Reason**: Environment Manager整体删除。

### Requirement: 真实 Task 写入必须使用 receipt-pinned retained controller
**Reason**: Agent直接使用已确认入口，具体owner核对身份。

### Requirement: Task Finish SQLite completion 必须与 Environment cleanup 幂等交接
**Reason**: Task结果和具体清理保持正交。

### Requirement: Environment Receipt 必须以 Plan 事实作为唯一环境 authority
**Reason**: Plan和Receipt删除。

### Requirement: Environment prepare 必须按 Agent Plan 确定性准备并真实探测执行基础
**Reason**: Agent按需调用Project/Service真实入口。

### Requirement: Environment 恢复必须按 Task ID 串行复核 Plan 与真实事实
**Reason**: 只重试失败的具体动作。

### Requirement: Environment Receipt必须审计Declaration到Step事实
**Reason**: 不持久化可重新观察的声明和步骤。

### Requirement: 旧Plan与Receipt只读兼容
**Reason**: 用户明确不保留旧数据或双读。

### Requirement: Task Environment Application 必须为 Buildr Web 提供唯一确定性操作边界
**Reason**: Buildr Web Environment接口和页签删除。

### Requirement: 自举 Task Validation Workspace 必须隔离候选 Buildr Web Structured Store
**Reason**: 自举继续由self-bootstrap owner和候选写入保护负责。

### Requirement: inspect 与 Buildr Web saved GET 必须保持不同只读语义
**Reason**: 两个Environment读取入口均删除。

### Requirement: 首次 prepare 必须显式登记当前宿主
**Reason**: prepare动作删除。

### Requirement: Git 任务分支默认前缀必须跟随实际 adapter
**Reason**: Worktree create显式接收branch，不由Environment推断。

### Requirement: Environment Receipt 必须提供权威runtime invocation
**Reason**: Runtime和CLI即时解析，不保存Receipt投影。

### Requirement: Task Environment必须独占capability准备闭包的执行与恢复
**Reason**: capability准备由Agent和真实owner按需执行。

### Requirement: Completed no-change Task 必须可受控清理 Environment
**Reason**: 不存在Environment cleanup。

### Requirement: Environment cleanup 必须消费可重建的已交付贡献证明
**Reason**: Worktree直接消费Agent核对的source/delivered提交。

### Requirement: Environment与Carrier cleanup结果必须保持正交
**Reason**: Environment侧已删除，其他owner继续独立。

### Requirement: 直接完成任务必须能按当前事实安全清理
**Reason**: Task Finish直接调用具体资源owner和Worktree。
