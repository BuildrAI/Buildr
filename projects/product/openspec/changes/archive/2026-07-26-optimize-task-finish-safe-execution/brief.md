# Task Finish 安全自动执行

## 摘要
在既有可恢复状态机上增加安全执行层，把正常收尾从 Agent 逐步编排改为确定性步骤自动推进。

## 背景与目标
上一轮真实 finish run 为 7 分 1 秒，而正式验证仅 31.63 秒。目标是在不降低门禁的前提下，把正常路径稳定到约 3 分钟。

## 范围与流程
executor 读取 checkpoint，预检并执行登记 handler，提交原有 completion；遇到失败或非自动步骤时停止，继续通过 inspect/resume 恢复。

## 风险与验收
不得扩大授权、绕过 lease/identity 或重复 effects。验收覆盖正常完成、blocked/resume、并发 fencing、只读并行和真实收尾耗时。
