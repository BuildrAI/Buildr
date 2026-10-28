## ADDED Requirements

### Requirement: Buildr Web 复制操作必须使用统一图标切换反馈

Buildr Web 中提供复制动作的入口 MUST 使用同一复制按钮。复制成功后图标 MUST 立即变为已复制标识并不可再次点击，3 秒后 MUST 恢复为复制图标并可再次点击；复制失败 MUST 保留复制图标并说明需要手动复制，MUST NOT 显示为已复制。带文字的复制入口 MUST 保留原有文字，由图标独立表达复制状态；MUST NOT 以重复的成功提示替代图标状态。

#### Scenario: 连续点击复制
- **WHEN** 用户点击复制并成功，随后在 3 秒内再次尝试点击
- **THEN** 第二次点击 MUST NOT 再次写入剪贴板，图标 MUST 保持已复制状态
- **AND** 3 秒后图标 MUST 恢复为复制图标并重新可点击

#### Scenario: 复制失败
- **WHEN** 浏览器拒绝写入剪贴板或复制命令失败
- **THEN** 界面 MUST 显示复制失败与手动复制的说明，图标 MUST 保持为可点击的复制图标
