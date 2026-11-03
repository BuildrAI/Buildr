## Context

见proposal。当前Qoder worker已能证明并复用安全结束的query，但外层scheduleSourceRelease和collectIdle会触发release-check关闭它。源资源属于准确参与者，不可通过虚报resourcesReleased保留。

## Goals / Non-Goals

目标：仅Qoder连续追问复用、闲置资源有界、切走清理未使用预热、升级可释放。非目标：其他Agent、模型加速、共享服务更新、付费性能测量。

## Decisions

1. 外层在正常自动回收路径中按Qoder最后实际使用时间保留5分钟；明确releaseIdleSources调用保持强制安全核验，升级不会被缓存TTL拦截。不改变Qoder原生释放证明。
2. 空闲保留不等于运行中，不将保留资源标记物理已释放；下次同参与者发送复用sourceRuntime。历史核对及新进程临时reader不获得此保留权。
3. Qoder未使用预热保留1分钟且只保留最新slot。Web选择效果清理携带原绑定discard，仅丢弃未被take的条目，不关闭已受理工作。相同slot不同key不相互误删；每次网页准备携带独立preparationId，重选相同绑定更新准备归属，旧preparationId的取消不关闭新准备。取消等待原准备结束后再释放，避免请求尚未建立条目时丢失清理。
4. 两个窗口为有界工程默认，不是收益实测结论。通过实例打开次数和上下文一致性证明避免重复启动，不把替身计时当真实首字收益。

## Risks / Trade-offs

保留实例增加有限闲置内存；默认5分钟后回收。并发取消、准备、采用以准确slot/key和现有closing控制；不能关闭已采用资源。真实活动、未知工具、问题、正在释放仍服从原安全边界。现有agent-integration覆盖新增测试，无需改测试地图入口。当前知识影响限已有Agent资源生命周期说明与随包Agent使用指引，明确保留不等于释放，不扩展其他知识。
