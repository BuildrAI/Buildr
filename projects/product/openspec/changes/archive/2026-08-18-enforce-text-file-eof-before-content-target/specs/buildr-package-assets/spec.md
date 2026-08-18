## ADDED Requirements

### Requirement: Required Core 明确文本文件 EOF 不变量
Buildr package assets MUST 在 required Core 中要求所有新建或重写的文本文件于最后一个非空字符后必须且只能保留一个换行符，并 MUST 明确文件末尾不得存在空白行。Core MUST 用 `...\n` 表示正确结果、用 `...\n\n` 表示错误结果，并 MUST 说明该限制只针对文件末尾，不限制正文内部的合理空行。

#### Scenario: Package 校验 Core EOF 正反例
- **WHEN** Buildr packages or validates `rules/buildr/core.md`
- **THEN** required Core MUST 同时包含 `...\n` 正例与 `...\n\n` 反例
- **AND** Core MUST 把约束限定到文件末尾并保留正文内部合理空行

#### Scenario: Agent 新建或重写文本文件
- **WHEN** Agent 在任意 Buildr Task 中新建或重写文本文件
- **THEN** Agent MUST 直接生成恰好一个结尾换行符且没有末尾空白行的结果
- **AND** Agent MUST NOT 将该规则解释为禁止正文内部的合理空行
