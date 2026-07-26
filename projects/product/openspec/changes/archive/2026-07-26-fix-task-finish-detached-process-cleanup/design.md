# 设计：精确回收 detached descendants

## Context

POSIX process group 是首选 ownership，但子进程可以建立新 group 或在父进程退出后重新托管。只在 `close` 时向原 PGID 发信号无法覆盖这类进程。

## Goals / Non-Goals

**Goals**

- 用 runner 运行期间观察到的 parent-child 关系建立精确 owned PID 集合。
- 清理原 process group 与集合中仍存活的 PID，并返回结构化 cleanup evidence。
- 保持 Windows 现有 `taskkill /t` 行为。

**Non-Goals**

- 不按可执行文件名、端口或目录做事后宽泛发现。
- 不引入 daemon、系统级 supervisor 或 OS sandbox。

## Decisions

### 运行期间采样 descendant tree

POSIX runner 以短周期读取 PID/PPID snapshot，从 step 根 PID 递归扩展 owned 集合。PID 一旦由已拥有 parent 观察到，即使随后 reparent 仍保留 ownership。结束时先清理 PGID，再逐个核对并终止集合中的存活 PID。

### 测试使用可注入 snapshot/kill

tracker 与 cleanup 接受 runtime 注入，单元测试模拟 descendant 从原 group 脱离并 reparent，验证只终止被观察到的 PID。真实 integration proof 覆盖 Task Finish selector plan 的 start→persist→completion。

## Risks / Trade-offs

- 极短命 descendant 可能来不及采样，但无需清理；仍存活的服务通常跨越多个采样周期。
- PID reuse 风险通过短 step 生命周期、运行期间 lineage observation 和结束时立即清理降低；不把历史 PID 跨 run 保存。
