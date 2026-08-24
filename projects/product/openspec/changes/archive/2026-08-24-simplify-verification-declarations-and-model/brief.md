# 收敛 Product 验证声明与模型

## 一句话摘要

用“证据、选择、验证对象”三个问题解释 Product 验证；普通 Task 默认 affected，完整日常证据公开称为 daily-full，Product Artifact Candidate 和 Published Release只增加各自节点专属证据。

## 背景与问题

公开声明和文档曾把affected、Core、Candidate、Release、Quick、profile与测试边界混在一起，用户难以判断一次验证为什么选择这些证据，也容易混淆Task Candidate与发布候选制品。近期黄金路径优化没有形成稳定收益，下一步选择审计需要先建立清晰且不复制authority的模型。

## 目标与非目标

- 目标：建立三轴模型、可信affected默认、可解释Full升级、daily-full兼容入口，以及Task Content/Product Artifact Candidate术语隔离。
- 非目标：不在本Change收窄owner mapping，不删除primary evidence，不重写registry/planner，不改变Candidate、tarball或Release mutation authority。

## 受影响角色

主要影响维护Buildr的用户和Agent：他们可从capability与plan直接识别验证对象、范围和交付决定。使用公共Task Verification schema的其他Project不增加字段或迁移要求。

## 核心流程与公开模型

| Verification target | Default selection | Object | Added evidence |
| --- | --- | --- | --- |
| Task Delivery | affected | frozen Task Content | affected development evidence |
| Full Regression | full | Task/current source | complete daily evidence |
| Product Artifact Candidate | full | exact source + candidate artifact | artifact/package/install compatibility evidence |
| Published Release | release-only | published artifact/result | publish, install, launcher, smoke, readback |

Static、Unit、Component、Integration、System只回答“用什么执行边界证明”；affected/full只回答“本次选择多少”；上表回答“验证什么对象、支持哪个决定”。Quick只提供开发期低成本反馈。

## 关键变化

- `test:daily-full` 是公开完整日常证据入口；`test:core`、`core` profile 和历史 plan/timing identity暂作同集合兼容投射。
- `verification.yml` 声明capability对象与决策；registry唯一持有step、dependency、resource、budget和primary owner。
- 普通Task的验证对象称为frozen Task Content；内部Task Candidate lifecycle identity不等于Product Artifact Candidate。
- 不调整changed ownership，不删除证据，不改变唯一Candidate、tarball、Launcher或Release authority。

## 当前实现与现场事实

- `test:daily-full`通过原Candidate runner选择内部`core` profile；兼容`test:core`只转发到该入口。两者plan的52个step和预算估算逐项相同，没有第二执行图。
- 当前Change本身修改package script、verification runner与声明执行语义，真实changed plan因此以`package-execution-metadata-change`和`execution-authority-change`合法升级Full；这不是普通Task默认升级规则。
- `docs/verification-ownership.md`反例保持affected，只选择完整Quick与`docs-quality`共8 steps；planner/runner authority反例保持稳定Full reason code。
- 2026-08-24现场plan-only：daily-full 52 steps、1,036秒目标工作量、259秒数学下限、360秒预算；Product Artifact Candidate 66 steps、1,398秒目标工作量、349.5秒数学下限、600秒预算。
- 本Change只证明模型和兼容边界更清晰，不声明执行时间下降；affected选择是否为普通Task主要瓶颈交给下一Contribution用Execution Record审计。

## 影响、风险与兼容性

公共`product.full-regression`改用`test:daily-full`，旧`test:core`继续选择同一registry集合。主要风险是兼容`core`名称被误解为公开维度，因此plan显式输出`evidenceSet=daily-full`与`compatibilityProfile=core`。声明不复制step、dependency、resource或budget authority。

## 验收摘要

OpenSpec strict、69项定点契约/Integration测试、真实affected反例与daily-full plan-only均已通过。实际Change因修改执行authority而合法升级Full；正式Execution Record在Change收敛、Content Target冻结后由Task Verification形成。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Product verification delta](specs/product-verification-quality/spec.md)
- [Tasks](tasks.md)
