## Why

Buildr Core 已要求面向用户使用简练语言和一致术语，但没有明确约束中英文专业术语的首次解释、后续称呼和实现标识保留方式，容易出现只写英文、译法漂移或为追求中文而损失实现精度。现在需要把这些要求收敛为一条简明、可执行的通用表达规则。

## What Changes

- 合并 Buildr Core 中现有的术语一致性与简明表达要求，形成一条统一的用户沟通规则。
- 要求已有中文名称的专业术语首次出现采用“中文（English Term）”，后续优先使用中文。
- 允许没有稳定中文译名的术语保留英文，但要求首次出现时说明含义。
- 明确命令、代码标识、字段名、接口名、文件路径和错误原文等需要精确对应实现的内容保留英文，必要时补充中文说明。
- 保持同一描述范围内的术语译法一致。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`: 扩展 Buildr Core 的用户表达要求，补充中英文专业术语与实现精确文本的使用规则。

## Impact

- 修改随 Buildr 包交付的 workspace Core Rule。
- 更新 `workspace-first-runtime-projection` 的 canonical Requirement 与场景。
- 不改变 CLI、API、数据模型、runtime adapter 或依赖。
