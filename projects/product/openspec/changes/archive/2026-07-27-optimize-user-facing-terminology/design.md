## Context

Buildr Core 当前分别约束“术语使用一致”和“面向用户简明表达”。两条规则存在交叉，但对专业术语首次出现、没有稳定译名以及必须保留英文原文的实现文本缺少统一边界。Core Rule 是所有 Buildr workspace 的必读资产，其产品源位于 package workspace target；根 workspace 中的 `rules/buildr/core.md` 是同步产物，不是长期事实源。

## Goals / Non-Goals

**Goals:**

- 把简明表达和中英文术语规则合并成一条可直接执行的 Core 约束。
- 优先让用户看到中文名称，同时保留实现精确性。
- 用契约测试防止关键边界在后续改写中丢失。

**Non-Goals:**

- 不建立新的术语表或修改 `terminology-governance` capability。
- 不要求命令、代码标识、字段名、接口名、文件路径或错误原文翻译为中文。
- 不改变 runtime adapter 的规则发现、加载或激活机制。

## Decisions

1. **合并现有两条 Core 原则。** 新规则同时表达简明中文、专业术语首次解释、后续中文称呼和译法一致性，避免多个相邻条款之间出现覆盖或冲突。保留两条并分别扩写会增加重复，并使 Agent 难以判断哪条优先。
2. **使用“中文（English Term）”作为已有中文名称术语的首次表达。** 这种形式同时服务用户理解和英文原词检索；后续优先使用中文，减少连续出现未经解释的英文术语。
3. **为没有稳定中文译名和实现精确文本保留例外。** 没有稳定译名的术语可保留英文并首次解释；必须与实现逐字对应的内容保留英文，避免翻译导致命令、字段或错误信息失真。
4. **只修改产品 package 源并通过 Buildr 同步投射。** 不直接编辑 task environment 根部的 runtime 派生规则；验证时检查 package 源、同步结果与 doctor 状态。
5. **不写入 Project glossary。** 本次定义的是沟通格式，不新增或重定义产品领域术语，因此术语治理结果为 `not-applicable`。

## Risks / Trade-offs

- [单条规则内容过长，降低可读性] → 保持三句结构：总原则、术语规则、精确文本例外。
- [Agent 机械地为每个英文词补充中文] → 将范围限定为面向用户说明中的专业术语，并明确实现精确文本例外。
- [产品源与 workspace runtime 不一致] → 从任务 checkout 的产品 CLI 执行同步并运行 doctor，核对投射结果。
