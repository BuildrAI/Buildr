# 将 Buildr 正式发布收敛为一次审批

一句话摘要：把 hosted authority probe、最终 pre-tag 校验、tag 创建和 npm publish 收敛到同一个 `npm-production` protected release transaction，使正常发布只需一次维护者审批。

## 背景与问题

当前发布由手动 authority probe 和 tag-push publish 两个 GitHub Actions run组成；两者各自声明 `npm-production` Environment，因此一次正式发布会产生两个deployment和两次审批。之前的优化只移除了候选准备阶段的probe，没有改变正式发布的双run结构。

## 目标与非目标

- 目标：可逆tarball、Host Node和Launcher验证通过后，只让一个protected job请求审批。
- 目标：审批后在同一个job依次证明current OIDC authority、完成最终pre-tag门禁、创建或复用匹配tag并发布/回读同一tarball。
- 目标：本机只dispatch并跟踪一次正式事务，不再创建或推送release tag。
- 非目标：不弱化GitHub Environment保护，不引入本机npm凭证，不承诺失败后新的deployment/attempt免审批。

## 受影响角色

- Buildr release maintainer：正常发布只审批一个run中的一个protected job。
- Buildr release workflow：获得tag与npm mutation的唯一受保护所有权，其他jobs保持read-only。
- Buildr Agent：从“probe后本机建tag”迁移为“dispatch一次transaction并跟踪同一run”。

## 核心流程

准备：release Task → `dev → main` Candidate gate → bridge → `post-main` source convergence → 停在tag前。

发布：用户明确授权 → dispatch一次workflow → contract/唯一tarball/Host Node/Launcher可逆验证 → 一次`npm-production`审批 → OIDC probe → hosted pre-tag convergence → tag ensure → npm publish与Registry/GitHub Release/readback → 精确安装smoke。

## 关键变化

- `publish.yml`只保留正式`workflow_dispatch`入口和唯一Environment owner。
- transaction inputs冻结version、source、candidate base/tree与workflow digest。
- hosted probe evidence在同一protected job内直接由pre-tag gate消费，不再先完成probe run再本机读回。
- tag使用ensure语义：不存在时创建，已存在时只接受相同source，任何漂移不移动、不覆盖。
- release Skill、checklist、flow、technical architecture与验证契约同步迁移。

## 影响、风险与兼容性

旧的probe-only inputs、tag-push自动发布和本机tag创建入口不再支持。唯一protected job同时拥有`contents: write`与`id-token: write`，因此通过job依赖、静态workflow contract与mutation顺序限制权限。tag创建后publish失败时保留tag作为恢复锚点；重跑必须重新证明current authority，GitHub可能对新的protected attempt再次请求审批。

## 验收摘要

- workflow中恰好一个job声明`npm-production`，且它依赖全部可逆验证。
- 正常发布只dispatch一次run，本机不创建tag；同一approved job完成probe、pre-tag、tag与publish。
- tag/source、workflow、candidate或Registry integrity漂移全部在继续mutation前fail closed。
- 唯一tarball、Trusted Publishing、双dist-tag回读和无GitHub binary Assets保持成立。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/open-source-release-governance/spec.md`
- `specs/product-verification-quality/spec.md`
- `tasks.md`
