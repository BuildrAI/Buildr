# task-evidence-coverage Delta: buildr-web-client

## MODIFIED Requirements

### Requirement: 任务详情必须按工作路径直接组织已有内容

默认页面 MUST在列表旁的现有副屏紧凑展示标题、编码、目标和状态，再以紧凑标签连接任务需求、方案设计、开发实现和任务收尾；方案审查 MUST在方案设计内，实现审查和开发验证 MUST在开发实现内，用户确认 MUST在任务收尾内。默认 MUST选中任务需求并直接显示任务目标（intent）正文，关联变更的 `brief.md` MUST作为补充需求文档在同层目录列出并可切换；切换节点 MUST直接显示对应文档或完整结果，多份材料 MUST在同层切换，不经过文件入口或资料目录中转。

#### Scenario: 读取完整任务

- **WHEN** Task拥有 brief.md、proposal.md、design.md、tasks.md、规范文件及专业结果
- **THEN** 需求节点 MUST默认显示任务目标正文，补充需求文档 MUST在同层目录列出并可切换到对应 brief；设计节点 MUST默认显示 proposal 正文并可切换 design/specs，实施清单 MUST在非模态浮窗中按需显示，实施节点 MUST显示实现审查与开发验证摘要，设计与实现内部的审查 MUST默认显示最新结论并可切换历次记录，开发实现内的验证 MUST直接展示当前结果及检查依据，收尾 MUST集中使用用户确认及交付记录
- **AND** 多个关联变更 MUST标识材料来源，原始正文保持其自身权威

#### Scenario: 简单任务与空内容

- **WHEN** Task没有方案材料或部分节点没有记录
- **THEN** 页面 MUST保持四个主节点并如实显示空内容；MUST NOT强制创建文档、报告、子任务或错误状态
- **AND** 没有补充需求文档时需求节点 MUST仍直接显示任务目标正文，不得显示虚构补充材料；任务目标缺失或为空时如实表达

#### Scenario: 当前工作与阅读选择不同

- **WHEN** 智能体记录 implementation 表示验证失败后的修复，而用户在方案设计内选择方案审查
- **THEN** 页面 MUST同时保留实现处的当前标记与方案设计及其内部方案审查的阅读选中态，显示保存的失败结果与当前实现标记
- **AND** 没有明确 stage 时 MUST不标记当前节点；MUST NOT从文件存在、清单数量或 active 状态推断当前节点、自动执行或通过
