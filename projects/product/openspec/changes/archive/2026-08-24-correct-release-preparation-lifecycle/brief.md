# Release selection 重开与候选版准备生命周期修正

## 一句话摘要

允许未产生公开发布事实的 frozen release 在失败 Candidate 后受控追加修复并重新冻结，同时让 `release-<version>` Task直到完整 Candidate、main 收敛与 readiness 成立后才完成。

## 背景与问题

当前 selection owner 把 freeze 视为永久封闭，导致已在 `dev` 交付的 Candidate 修复无法进入同一 release。与此同时，发布材料 Task Finish 会提前把名为“准备候选版”的 Task置为 completed，即使 Candidate aggregate已经失败、main尚未收敛、readiness也未通过。

## 目标 / 非目标

- 目标：显式 reopen、不可变历史freeze、旧证据失效、新generation refreeze。
- 目标：分离完整release协调Task与可独立交付的support Task，阻止失败Candidate后的完成误报。
- 非目标：不自动跟随`dev`，不重开通用terminal Task，不改变Candidate或publication owner，不授权tag/npm/GitHub Release。

## 受影响角色

- Buildr release maintainer：失败Candidate后可从同一selection安全恢复，并看到真实的准备Task状态。
- Release consumer：继续只接受current selection/Candidate/artifact/readiness identity，历史freeze仅用于审计。
- Task owner：support delivery与release preparation completion保持独立。

## 核心流程

`frozen generation N → Candidate failed → public facts readback → explicit reopen → cherry-pick -x fixes → generation N+k freeze → new full Candidate → release→main → readiness → release Task complete`。

## 关键变化

- selection CLI新增`reopen --confirm --reason`，并维护`freezes/<generation>`历史refs。
- read model增加`freezeHistory`并把history/current freeze纳入selection identity。
- `buildr-release`要求`release-<version>`协调Task在完整准备前保持active；内容交付由support Task承担。
- 当前已错误completed的rc.22 Task不改写，使用明确active recovery Task继续并披露恢复关系。

## 影响 / 风险 / 兼容性

- 新旧单一frozen ref可在首次reopen/freeze时兼容迁移。
- reopen只改变本地lifecycle refs，不产生remote或公共副作用；公开事实由release workflow owner核验。
- 通用Task终态仍单向，避免为发布特例破坏既有Finish和Task Record authority。

## 验收摘要

- frozen selection不能直接update，但显式reopen后可以追加明确dev commit并重新freeze。
- 历史freeze可重建，ref竞争、错误状态、缺少确认或原因均fail closed。
- failed Candidate不再导致release Task completed；只有完整准备终点允许完成且不授权publication。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Release collection delta](specs/release-collection-model/spec.md)
- [Agent workflow delta](specs/agent-task-workflows/spec.md)
- [Tasks](tasks.md)
