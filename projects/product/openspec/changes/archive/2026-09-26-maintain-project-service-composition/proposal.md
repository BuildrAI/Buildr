## Why

现有项目（Project）组成图已经读取项目（Project）、服务（Service）和代码库实例（Repository Instance）的登记关系，但缺少帮助智能体（Agent）首次梳理及在开发中持续维护这些关系的方法。首版通过轻量技能（Skill）维护现有本地清单（Manifest），让组成随业务发展保持准确。

## What Changes

- 新增 `project-composition-maintenance` 技能（Skill），以业务目标、已确认决定、代码和配置为依据维护组成。
- 复用 `buildr assets inspect|associate` 及已有登记动作写入本地清单（Manifest），保留身份、其他关联和版本保护。
- 在任务分流方法中接入按需检查，在已有组成说明中补充维护方式。
- 不新增字段、服务（Service）间依赖、独立图数据、后台监听、云端接口（API）或能力协作约定（Capability Contract）。无破坏性变更。

## Capabilities

### New Capabilities

- `project-composition-maintenance`: 首次梳理和日常增量维护项目（Project）的服务（Service）组成，复用已有本地关系及图示。

### Modified Capabilities

无。现有对象关系及保存语义保持不变。

## Impact

影响随包技能（Skill）源、资源登记、任务分流指引及现有组成解释文档。复用现有命令行接口（CLI）、本地保存事务与页面读取，不修改应用代码及第三方依赖。
