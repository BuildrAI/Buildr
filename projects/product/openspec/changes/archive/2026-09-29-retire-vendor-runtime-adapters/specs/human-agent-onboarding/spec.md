## REMOVED Requirements

### Requirement: Buildr onboarding guidance 覆盖新增 adapters
**Reason**: `cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 不再作为独立 supported adapter 注册，onboarding 不再存在"新增 adapter"这一类目标。把它们继续写成可选 adapter 会让 Agent 选择不存在的接入方式。

**Migration**: onboarding guidance 与权威文档改为只引导 `agents-standard` 与已注册例外 `claude-code`；Agent 识别到自身为上述品牌或其他有效运行时身份时，保留该身份并使用标准适配器的命令，不再按品牌选择 adapter。既有的"未列出的有效 runtime 默认使用标准文件约定"要求继续适用。
