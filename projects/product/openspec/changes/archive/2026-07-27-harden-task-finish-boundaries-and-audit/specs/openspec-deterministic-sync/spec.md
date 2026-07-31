## ADDED Requirements

### Requirement: OpenSpec 收敛必须提供只读文件事实审计
Buildr MUST 提供只读审计入口，使用唯一收敛回执中的 before/expected 摘要和当前正式文件事实逐文件分类。审计 MUST 只返回 Project 相对路径与摘要，不得写正式文件、刷新回执、创建旁路状态、归档 Change 或推断未被文件事实证明的恢复阶段。

#### Scenario: 部分文件异常变化
- **WHEN** 一部分正式文件等于 expected 而另一部分既不等于 before 也不等于 expected
- **THEN** 审计 MUST 返回 `recovery-unprovable` 和 `state-unknown`
- **AND** 每个文件 MUST 展示 before、expected、actual 摘要及 `before|expected|unknown` 分类

#### Scenario: 应用完成但回执未更新
- **WHEN** 所有正式文件均等于 expected 摘要而回执仍为 planned-not-applied
- **THEN** 审计 MUST 将实际事实分类为 `applied-and-matched`
- **AND** MUST NOT 为了修正声明而写回执

#### Scenario: 回执无效或缺失
- **WHEN** Buildr 无法读取或验证唯一收敛回执
- **THEN** 审计 MUST 返回 `recovery-unprovable` 和最小诊断
- **AND** MUST NOT 回退到 baseline、pre-sync receipt、sync plan 或 recovery receipt 生成新的授权事实

### Requirement: 历史收敛接口必须按零消费者门禁退役
Buildr MUST 维护历史 `baseline`、`check`、`sync-plan`、`sync-apply` 及旧旁路状态的单一退役登记。兼容入口在移除前 MUST 返回结构化弃用信息和 `converge` 或 `audit` 替代入口；新正常路径 MUST NOT 消费或生成旧旁路状态。只有当前产品、受管 Rules、Skills、Components、Commands 和非历史文档达到零消费者，且兼容窗口满足时，登记才可报告可删除。

#### Scenario: 旧命令仍被兼容调用
- **WHEN** consumer 调用仍处于兼容窗口的旧命令
- **THEN** Buildr MUST 保持既有行为并返回弃用状态、替代命令与移除条件
- **AND** 文本输出 MUST 明确提示该入口不会用于新的 Task Finish 路径

#### Scenario: 当前产品重新依赖旧命令
- **WHEN** 契约扫描发现非兼容实现或非历史夹具重新调用旧命令或依赖旧旁路文件
- **THEN** 正式验证 MUST 失败并报告消费者位置
- **AND** 退役登记 MUST NOT 报告可删除

