## Why
项目级能力上下文与工作空间技能发现和绑定重复，且项目绑定不进入常规技能正文投射，容易造成已配置即生效的错误预期。当前产品自举和集鲜配置均没有项目需求或绑定的实际使用，退役这一层可减少无收益维护。

## What Changes
- **BREAKING** 退役 `buildr.project-capabilities/v1` 与项目 `capabilities.yml` 的需求、绑定和技能适用性解析。
- 项目创建、修复与诊断不再生成或要求该文件；项目级 bind/unbind 明确拒绝且不写入。
- 旧文件由 Doctor 只读诊断，同步自动删除仅有空需求/绑定和技能名单的安全旧文件；其他文件保留，不迁移或扩大绑定范围；有效配置与不可读内容给出明确提醒。
- 保留工作空间技能注册、能力契约、依赖、绑定和投射。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `skill-capability-contracts`: 仅工作空间能力解析与选择，移除项目上下文和跨项目绑定语义。
- `project-registry`: 项目基线不含能力上下文，按安全预检清理或提示旧文件。
- `human-agent-onboarding`: 技能采用不再写项目适用性。
- `managed-skill-assets`: 移除项目适用性维护义务。
- `workspace-first-runtime-projection`: 工作空间是技能能力配置的唯一作用域。

## Impact
涉及 agent-assets、workspace 与 diagnostics 模块、CLI、项目模板、技能指引、测试和关联知识。仅修改 Buildr 产品，不写集鲜工作空间，不提交、推送或发布；非清理目标与归档历史保持原文。
