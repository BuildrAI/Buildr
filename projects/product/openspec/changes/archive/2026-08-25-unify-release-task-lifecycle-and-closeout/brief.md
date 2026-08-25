# 统一 Release Task 生命周期与发布清理

## 一句话摘要

让每个版本只使用一个持续到publication、main→dev与必需closeout完成的release协调Task，并由产品原生管理generation carrier、恢复身份和零中间资源清理。

## 背景与问题

现行流程在Candidate、release→main和readiness完成后提前结束协调Task，publication与发布后维护在Task外继续。rc.22因此产生多个resume/refresh协调Task；实际generation PR使用临时`release-main-gN` branch，但产品没有完整ownership与cleanup；本地selection cleanup又把正式远端release ref的存在误当作本地资源不能清理。main→dev创建merge commit，而current `dev`线性历史保护使成功依赖管理员绕过。

## 目标与非目标

目标是建立唯一active协调Task、派生release lifecycle、稳定recovery identity、generation-scoped carrier、明确正式/中间ref分类、分支策略预检和幂等closeout。非目标是不改变通用Task Record schema、不回写历史rc.22 Task、不自动取得publication或远端删除授权，也不执行真实发布。

## 受影响用户或角色

- Buildr release维护者：使用一个Task观察和恢复完整发布生命周期。
- Agent：按current lifecycle与owner结果继续，不再创建resume/refresh/finalize协调Task。
- 仓库维护者：需要让`dev`策略明确允许产品拥有的merge commit，或在策略不匹配时接受发布后收敛blocked。

## 核心流程

`selection → Candidate/唯一artifact → release→main generation carrier → readiness → 等待显式publication授权 → protected transaction → main→dev → 必需closeout → Task completed`。support修复Task独立交付并由correlation引用；正式远端release ref默认保留，全部中间资源必须清理。

## 关键变化

- readiness只进入授权等待，不完成Task。
- lifecycle与recovery identity从current owner facts派生，不新增旁路状态表。
- PR使用`codex/release-main-<version>-g<generation>` carrier并由owner清理。
- remote-tracking ref不再阻塞本地selection cleanup。
- main→dev在push前核验branch policy，拒绝依赖管理员绕过线性历史。
- closeout把正式release ref核验与中间资源清理分开。

## 影响、风险与兼容性

旧terminal release Task保持只读历史，统一模型从后续版本生效。若`dev`仍要求线性历史，Publication保持已成立，但main→dev返回带recovery identity的blocked；不会force push、删除tag或unpublish。删除正式远端release ref仍需独立授权且不是Task完成门禁。

## 验收摘要

- 同version在Candidate/new generation/attempt恢复中始终只有一个协调Task。
- 等待授权时Task active，protected transaction与必需closeout完成后才completed。
- 正式远端release ref保留并核验，本地branch/lifecycle refs、worktree和中间carrier为零。
- branch policy、冲突、remote race与ownership漂移均在危险mutation前失败关闭。
- 黄金生命周期测试覆盖无代码协调Task与完整恢复链。

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Release collection delta](specs/release-collection-model/spec.md)
- [Release governance delta](specs/open-source-release-governance/spec.md)
- [Agent workflow delta](specs/agent-task-workflows/spec.md)
- [Implementation tasks](tasks.md)
