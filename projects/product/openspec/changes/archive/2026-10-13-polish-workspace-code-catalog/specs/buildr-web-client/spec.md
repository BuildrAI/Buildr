## ADDED Requirements

### Requirement: 工作空间切换菜单保持名称对齐

工作空间（Workspace）切换菜单 MUST 让全部名称使用一致的左侧边界和行内布局，当前选中标记 MUST 位于名称右侧，MUST NOT 因有无标记改变名称起点。当前工作空间（Workspace） MUST 有可辨认的选中状态，长名称 MUST 可按需获知完整内容；现有切换、工作空间（Workspace）设置和全部工作空间（Workspace）入口 MUST 保持可用。

#### Scenario: 当前项与其他项同时出现
- **WHEN** 用户打开含当前项与其他可用项的工作空间（Workspace）切换菜单
- **THEN** 所有名称 MUST 左对齐，当前项右侧 MUST 显示选中标记，其他项 MUST 保留一致的名称布局

#### Scenario: 长名称和菜单操作
- **WHEN** 菜单包含长工作空间（Workspace）名称，用户切换条目或使用设置与全部工作空间（Workspace）入口
- **THEN** 完整名称 MUST 可按需获知，所有原操作 MUST 继续指向其明确工作空间（Workspace）范围
