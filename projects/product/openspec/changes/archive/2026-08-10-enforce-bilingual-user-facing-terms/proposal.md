## Why

Buildr 核心规则（Buildr Core）当前只要求已有中文名称的专业术语首次出现时采用中英文并列，后续优先使用中文；没有稳定中文译名时还允许只保留英文。这使智能体（Agent）在面向用户的回复中持续裸用英文专业术语，显著增加中文用户的理解成本。

## What Changes

- 允许面向用户的专业术语使用纯中文或中英文并列。
- 只要使用英文专业术语，就必须同时提供对应中文名称或中文释义，采用“中文（English Term）”形式，不得单独使用英文专业术语。
- 没有稳定中文译名时，仍须提供准确中文释义，并可在括号中保留英文原词。
- 保留命令、代码标识、字段名、接口名、文件路径、错误原文和产品专名等必须精确对应实现内容的英文例外；将其作为专业概念向用户说明时仍须补充中文说明。
- 更新核心规则（Core Rule）的契约测试，防止“仅首次双语”或“无译名即可只写英文”的旧语义回归。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`：收紧 Buildr Core 面向用户的中英文专业术语表达要求，禁止英文专业术语单独出现。

## Impact

- 修改 Buildr 软件包（package）交付的工作空间核心规则（workspace Core Rule）产品源。
- 修改 `workspace-first-runtime-projection` 的正式规范与场景。
- 更新 Core 用户表达契约测试。
- 不改变命令行接口、应用程序接口、数据模型、运行时适配器、依赖或术语治理能力。
