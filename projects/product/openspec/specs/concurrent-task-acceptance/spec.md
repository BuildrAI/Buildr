# concurrent-task-acceptance Specification

## Purpose

定义两个任务并发开发与验证的组合验收、结构化证据和隔离边界，确保入口、预览、共享验证资源、目标分支竞态及清理在同一场景中可重复核验。

## Requirements

### Requirement: 双任务并发组合验收

Buildr MUST提供双正式Task组合验收，覆盖两个独立Worktree、多仓scope、Preview并发、错误owner停止拒绝、dirty/版本漂移清理拒绝和Task结果与资源清理正交。验收 MUST不创建Task Environment、Plan或Receipt。

#### Scenario: 两个Task并发工作
- **WHEN** 两个Task各自创建matching Worktree并启动不同Preview实例
- **THEN** checkout、状态目录、URL、PID与owner MUST互不串扰

#### Scenario: 一个Task准备动作失败
- **WHEN** 一个Task的Project准备入口失败
- **THEN** 只阻塞依赖该入口的动作，另一个Task和其他能力继续工作

#### Scenario: 两个任务从不同执行目录运行专属 CLI
- **WHEN** 两个Task分别在matching Worktree运行实际CLI
- **THEN** 每个CLI MUST只作用于自己的checkout和Task

#### Scenario: 两个任务并发运行且互不串扰
- **WHEN** 两个Task并发执行构建、验证或Preview
- **THEN** 文件、进程、端口和结果 MUST互不串扰

#### Scenario: 多仓Worktree保持完整成员边界
- **WHEN** 一个Task包含多个Project或独立repository
- **THEN** Worktree evidence MUST完整列出selected repositories且不扩展Task scope

#### Scenario: 整体验收完成清理
- **WHEN** 两个Task成果已核对且资源owner完成各自清理
- **THEN** 验收 MUST证明无未知目录、分支或进程被删除

#### Scenario: 目标分支发生竞态
- **WHEN** source或delivered retained ref在清理前发生漂移
- **THEN** Worktree cleanup MUST拒绝具体删除并保留现场

### Requirement: 并发验收证据

验收证据 MUST直接引用Task Record、Worktree evidence、Preview owner、实际命令和具体cleanup结果，不得生成Environment summary或ready结论。

#### Scenario: 输出组合证据
- **WHEN** 双任务验收结束
- **THEN** 每项事实 MUST归属真实owner且可独立核对

#### Scenario: Candidate 消费验收结果
- **WHEN** Product Candidate选择双任务并发验收
- **THEN** Candidate MUST消费同一owner输出的结构化结果而非Environment summary

#### Scenario: 并发 worker 异常退出
- **WHEN** 任一worker异常退出
- **THEN** 验收 MUST保留已完成owner证据并对未完成cleanup给出明确诊断

### Requirement: 双任务验收必须消费正式 Workspace 验证入口

双任务验收 MUST由Agent按Project测试地图直接运行当前测试入口并分别记录有意义的Task Verification report；不得通过Task Environment执行capability run。

#### Scenario: 并发运行验证
- **WHEN** 两个Task需要验证
- **THEN** Agent MUST在各自真实工作根调用Project声明的测试入口

#### Scenario: 一个 execution 中断
- **WHEN** 一个Task的测试执行中断
- **THEN** 另一个Task的验证和已成立结果 MUST不受影响

#### Scenario: 两个 task 并发验证普通 Project
- **WHEN** 两个Task并发调用普通Project测试入口
- **THEN** 每份Task Verification report MUST绑定自己的Task、内容和测试地图identity

### Requirement: 双任务验收必须覆盖 runtime 所有权负向清理

双任务验收 MUST证明错误Task不能停止另一Task的Preview，dirty、未知owner或版本漂移不能删除Worktree，且Task完成不被cleanup失败撤销。

#### Scenario: 错误 owner 与提前清理均被拒绝
- **WHEN** Task A尝试停止Task B Preview或删除不匹配Worktree
- **THEN** 具体owner MUST拒绝且保持现场
