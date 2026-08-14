# 取消 dev push 的自动 Product CI

## 一句话摘要

让 Buildr 的 GitHub hosted CI 只承担 PR、显式诊断、完整 Candidate 与 Release 边界，直接推送 `dev` 的 Formal Finish 和 self-bootstrap successor 不再重复启动 Product workflow。

## 背景与问题

Buildr 正式任务已经在隔离 Environment 中完成 affected Verification，并通过 Task Finish、远端 readback和适用的 self-bootstrap Doctor形成交付证据。当前每个 `dev` push仍启动macOS和Windows Development feedback；紧随source commit的self-bootstrap successor还会取消前一轮并产生空affected plan，使Hosted CI重复本地正式证据且增加无效运行。

## 目标与非目标

- 目标：删除`Verify Buildr`的`dev` push触发，保留PR到`dev`、`dev → main`、手工Candidate和tag发布边界。
- 目标：用规范、当前认知和workflow契约测试固定各验证owner。
- 非目标：不调整OS matrix、Candidate shards、正式Task Verification、Finish或self-bootstrap实现。

## 受影响角色

主要影响Buildr维护者、Agent和外部贡献者。Formal Finish继续直接交付`dev`；外部或普通feature branch通过PR到`dev`取得hosted affected反馈。

## 核心流程

正式Task在本地完成Verification并由Finish推送`dev`，不自动启动GitHub workflow；self-bootstrap successor由其runner完成sync、push readback、development identity和Doctor。PR到`dev`运行affected feedback，`dev → main`运行完整Candidate，tag workflow验证并发布真实制品。

## 关键变化

- `Verify Buildr`顶层事件只保留`pull_request`和`workflow_dispatch`。
- Development feedback只接受目标为`dev`的PR。
- Candidate和Publish触发条件保持不变。
- 契约测试结构化检查事件集合与job条件。

## 影响、风险与兼容性

直接绕过Formal Finish推送`dev`将不再得到自动GitHub兜底，因此普通贡献必须使用PR；平台高风险修改也应通过PR到`dev`取得Windows hosted evidence。`main` Candidate gate和tag publish不受影响。

## 验收摘要

需要证明workflow不存在`push`事件，PR到`dev`仍运行双平台affected反馈，`dev → main`与手工Candidate条件未变化，tag publish未变化，并且OpenSpec strict与affected Product验证通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Product verification quality delta](specs/product-verification-quality/spec.md)
- [Tasks](tasks.md)

