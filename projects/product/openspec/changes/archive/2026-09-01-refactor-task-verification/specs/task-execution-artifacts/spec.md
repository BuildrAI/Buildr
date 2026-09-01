## REMOVED Requirements

### Requirement: Task execution record 必须由单一 Application 管理
**Reason**: 当前没有生产流程创建Task Execution Record，保留通用Application只会维护空架构。
**Migration**: Task Finish使用自身Result和恢复事实；未来真实长流程按具体owner重新设计。

### Requirement: execution record 正文必须在写入前受限处理
**Reason**: Execution Record正文存储整体删除。
**Migration**: 项目runner或具体owner管理自己的瞬态输出。

### Requirement: execution record 容量必须固定且在execution前backpressure
**Reason**: Execution Record配额与reservation整体删除。
**Migration**: 无。

### Requirement: execution record retention 与单记录cleanup 必须可恢复
**Reason**: Execution Record retention、resolution和cleanup整体删除。
**Migration**: 无。

### Requirement: Verification producer 必须映射为 closed execution record
**Reason**: Task Verification不再拥有producer或Execution Record。
**Migration**: Agent只记录最终报告摘要。

### Requirement: Verification record正文必须使用closed body dictionary
**Reason**: Verification record正文能力删除。
**Migration**: 项目runner自行管理详细日志。

### Requirement: Verification transient cleanup 必须晚于record seal
**Reason**: Task Verification transient与seal流程删除。
**Migration**: 无。

### Requirement: Finish producer 必须把每次 invocation 映射为独立 closed execution record
**Reason**: Task Finish当前没有Execution Record生产者，Finish结果由自身authority保存。
**Migration**: 使用Task Finish current/terminal Result、failure和cleanup事实。

### Requirement: Finish record 正文必须使用 closed invocation diagnostics dictionary
**Reason**: Finish Execution Record正文整体删除。
**Migration**: 必要诊断保留在Task Finish自身结果或本次工具现场。

### Requirement: Finish diagnostics transient cleanup 必须晚于 record retained
**Reason**: Finish record retained流程删除。
**Migration**: Task Finish只清理自己明确拥有的瞬态资源。

### Requirement: Task Execution Record 必须提供同 authority 的 portable 只读视图
**Reason**: Execution Record读模型、CLI、HTTP与Web入口整体删除。
**Migration**: Task Verification和Task Finish分别读取自己的Application。

### Requirement: Task Execution Record 正文必须通过白名单限量读取
**Reason**: Execution Record正文读取入口删除。
**Migration**: 无。

### Requirement: ExecRecord GC 必须按既有 authority 执行 bounded Workspace 回收
**Reason**: Execution Record表和正文生命周期删除，不再需要GC。
**Migration**: 升级时删除表；明确owned本机目录由有界清理移除。

### Requirement: ExecRecord GC 必须有限期保留 cleaned tombstone
**Reason**: Execution Record tombstone删除。
**Migration**: 无。

### Requirement: ExecRecord GC 结果必须 portable 且有界
**Reason**: GC命令和Result删除。
**Migration**: 无。

### Requirement: Verification execution record 必须保存closed invocation identity
**Reason**: Verification invocation和record删除。
**Migration**: 无。

### Requirement: Agent CLI read model 必须从同一 execution record authority 投影compact事实
**Reason**: Agent CLI list/inspect删除。
**Migration**: Agent读取各专业Application结果。

### Requirement: Verification open Execution Record 必须支持受控恢复
**Reason**: Verification recovery入口删除。
**Migration**: Agent重新运行测试或如实报告。

### Requirement: 不可证明的 Verification 执行必须以显式授权接受 unknown
**Reason**: unknown outcome授权和执行恢复删除。
**Migration**: Agent重新运行测试或如实报告。

### Requirement: Formal Verification stdout 必须默认投影 Execution Record compact summary
**Reason**: Formal Verification stdout和compact summary删除。
**Migration**: 无。

### Requirement: Open Verification record 必须提供有界 current progress snapshot
**Reason**: Open Verification record删除。
**Migration**: 无。
