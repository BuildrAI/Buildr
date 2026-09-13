# openspec-deterministic-sync Specification

## Purpose

定义 Buildr 如何从 delta、contract baseline 与 canonical facts 证明唯一同步结果，原子应用 identity-bound plan，并在语义歧义、输入漂移或验证失败时保持零写入和可恢复的 Agent fallback。

## Requirements

### Requirement: 标准规范转换与归档由锁定上游执行
Buildr MUST委托经过验证的 OpenSpec 1.13.0 处理标准规范解析、重建和归档写入；MUST NOT在正常路径复制标准规范转换算法或默认执行前后两次全项目验证。

#### Scenario: 正常归档
- **WHEN** 已授权归档且相关冲突检查通过
- **THEN** 系统调用锁定上游完成规范写入和归档，并报告真实结果

### Requirement: 跨进程恢复必须依据当前文件
Buildr MUST保留中断前观察与必要恢复信息；重试 MUST复查当前文件与原操作范围，未知混合状态 MUST保持内容并报告 recovery-unprovable。旧恢复材料 MUST保持可诊断，MUST NOT被新成功声明覆盖。

#### Scenario: 中断后存在并发修改
- **WHEN** 原操作中断且文件已经被其他参与者修改
- **THEN** 系统保留当前文件并指出差异，不自动恢复旧内容
