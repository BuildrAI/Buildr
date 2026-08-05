# 将 Buildr development 安装移到自举 Workspace activation

## 一句话摘要

共用 Task Finish 不再安装 Buildr development CLI或`Buildr Dev.app`，由Buildr自举Workspace的`buildr-self-bootstrap` Component在Formal Finish成功后按冻结Task Contribution执行专属activation。

## 背景与问题

当前共用Finish executor把Buildr Product源码路径映射为本机development CLI与Local App安装，并把安装成功纳入terminal delivered门禁。该行为只属于Buildr自举维护，却会进入普通用户Workspace的公共交付路径，扩大了产品checkout、本机launcher和`/Applications`副作用边界。

现有`buildr-self-bootstrap` Component已经通过Workspace专属Contribution处理post-Finish package收敛，因此可以在不改变Formal Finish五阶段和authority的前提下统一接管自举activation。

## 目标与非目标

目标是让共用Finish只保留交付载体、push/readback、必要runtime render、Doctor和cleanup，并让单一self-bootstrap Skill按冻结路径去重执行package sync、development CLI install、development Local App install与最终Doctor。

不建设公共activation framework、第二writer/store、事件总线、daemon、adapter registry或第二capability graph；不把self-bootstrap发布给普通用户Workspace；不改变Candidate、Verification、Review、decision、handoff、Task Record或Environment cleanup authority。

## 受影响用户或角色

- 普通Buildr用户Workspace：Task Finish不再感知Product checkout或触发development安装。
- Buildr维护者与Agent：Formal Finish之后得到独立、可诊断的自举activation结果。

## 核心流程

1. Task Development形成current handoff，Formal Finish按固定五阶段完成carrier交付、remote readback、通用activation、Doctor和cleanup。
2. 仅当当前Workspace安装`buildr-self-bootstrap` Component时，Contribution在成功Result之后调用专属Skill。
3. Skill只读取Result绑定的冻结Task Contribution paths，形成去重动作计划并逐项执行。
4. activation通过则报告精确identity；失败则报告“主任务已交付、自举Workspace激活未完成”与恢复事实，不回写上游authority。

## 关键变化

- 共用executor和terminal projection解除CLI/Local App安装门禁。
- `buildr-self-bootstrap-sync`收敛为统一self-bootstrap activation入口。
- v2 Result保持兼容，旧安装字段不再拥有delivered权责。
- package/runtime parity同时证明用户Workspace缺失专属能力、自举Workspace正确组合Component。

## 影响、风险与兼容性

旧完整v2 Result继续安全读取，不做机械schema迁移。post-Finish activation失败可能形成“远端已交付、本机自举未收敛”的显式双状态；通过逐动作evidence和专属恢复入口处理，不能撤销Formal Finish。

## 验收摘要

- 普通用户Workspace的Finish成功、cleanup正常，两个installer调用均为零且不要求Product checkout。
- CLI、Local App、package与组合路径由self-bootstrap单次去重执行并通过Doctor。
- activation失败不改写Finish、Development、Verification、Review、Task Record或cleanup。
- package/runtime parity证明无新增authority/store/writer与无用户Workspace自举能力。

## 技术 artifacts入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [agent-task-workflows delta](specs/agent-task-workflows/spec.md)
- [buildr-package-assets delta](specs/buildr-package-assets/spec.md)
- [tasks.md](tasks.md)
