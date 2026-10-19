## ADDED Requirements

### Requirement: 工作摘要必须可携带三项检查的适用性结论

Task Work Context MUST 在保留既有字段的同时支持可选 `checks`：固定检查名 `planning-review`、`implementation-review`、`verification`，每项当前结论为 `needed` 或 `not-applicable` 并附与本次事实相符的简短理由；同一检查重复记录原子替换当前结论，与其他工作摘要字段随同一 contextDigest compare-and-set 保存。该字段 MUST NOT 记录已形成的真实审查或验证结果，也不得复制专业应用的状态。

#### Scenario: 记录不适用理由
- **WHEN** Agent 在任务仍为 `active` 时判断某检查不适用
- **THEN** 工作摘要入口 MUST 接受该检查的 `not-applicable` 结论与理由并随上下文原子保存
- **AND** 读取方 MUST 能在任务详情或其他入口区分该检查为不适用而非未执行

#### Scenario: 结论随事实更新
- **WHEN** 同一检查从 `not-applicable` 变为需要、或理由因方案变化更新
- **THEN** 新记录 MUST 原子替换该项当前结论
- **AND** MUST NOT 累积成历史或影响其他检查项

#### Scenario: 终态任务拒绝写入
- **WHEN** 任务已 `completed` 或 `abandoned`
- **THEN** 检查适用性记录 MUST 被拒绝且已有内容仍可读取
