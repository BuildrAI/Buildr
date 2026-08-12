# Task Finish detached process cleanup 补丁

## 一句话摘要

精确回收验证期间已由 runner-owned lineage 观察到、随后 detached 或 reparented 的子进程，并验证 selector execution plan 能在真实 completion 中重放。

## 背景与问题

第一阶段真实收尾遗留 7 个 Local App fixture 进程；同时 selector plan 曾因规范化字段丢失导致 completion 误阻塞。

## 目标与非目标

目标是补齐两个正确性缺口。非目标是建设第二阶段 safe executor、降低 Candidate 覆盖或按进程名/端口清理。

## 验收摘要

聚焦测试模拟 detached/reparented lineage，真实 affected verification 后不残留 task-owned fixture；Task Finish selector plan 完成路径通过。
