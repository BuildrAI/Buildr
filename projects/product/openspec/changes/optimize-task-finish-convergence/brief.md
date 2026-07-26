## 摘要

让 Buildr 的 Task Finish 在不降低验证与同步门禁的前提下，减少 OpenSpec 收尾中的可预防返工，并报告真实的耗时归因。

## 背景与问题

现有门禁能拦住错误同步，但 post-sync mismatch 的恢复依赖手工全文比对；rehearsal 的相对 CLI 路径也会在隔离副本失效。结果是一次正常收尾可能出现额外诊断、回退和验证证据解释成本。

## 目标与非目标

目标是 receipt 驱动的同步顺序、可操作 mismatch 诊断、稳定 rehearsal executable 与阶段化成本报告。非目标是不再验证、自动接受同步结果或修改 OpenSpec 上游。

## 核心流程

完成 Change 后，Task Finish 先解析绝对 OpenSpec executable 并 rehearsal，成功 pre-sync receipt 才授权 canonical sync；post-sync 的 failure 直接指出 touched Requirement 的期望/实际摘要和返回阶段。冻结树后执行一次所需 assurance，最终报告分别呈现验证耗时、workflow checks 与失效重试成本。

## 风险与验收

保持 fail-closed 与现有 JSON 兼容；成功路径不得新增第二次正式验证。验收以 guard/Skill contract tests、rehearsal path tests 和收尾报告 evidence 为准。
