# P2 共享 Readiness 与受保护发布事务

## 一句话摘要

把release selection、matching Candidate artifact与Task correlation组合为共享context，让本地Readiness保持零副作用，并让唯一protected workflow消费同一digest和tarball完成发布及恢复。

## 背景与问题

P1-A、P1-B、P1-C已经分别交付selection、Candidate artifact和Task evidence read model，但当前transaction runner仍fail-fast拼装事实并直接dispatch，`publish.yml`还会重新build/pack，无法证明pre-candidate、pre-main、dispatch和hosted pre-tag使用同一事实链。

## 目标与非目标

- 目标：closed context builder、分阶段collect-all Readiness、显式publication授权、单一Candidate artifact消费、current attempt evidence与恢复分类。
- 非目标：不新增Task/SQLite writer，不模拟本地OIDC，不创建第二workflow/tarball，不实现release→main、main→dev或branch cleanup。

## 受影响角色

- 发布维护者先看到完整finding和hosted deferred checks，再决定是否授权publication。
- Agent只调用无副作用readiness或显式dispatch adapter，不自行创建tag或本机publish。
- GitHub protected transaction在一次`npm-production`approval内独占公共mutation。

## 核心流程

1. 同一builder收集owner facts并按阶段形成Readiness Result。
2. `dispatch-check`冻结完整context digest；未授权时停在`effects: []`。
3. 授权后唯一workflow从matching Candidate run下载aggregate和tarball，逐字节核对context。
4. protected job完成OIDC、pre-tag、tag、npm/dist-tag、GitHub Release与Registry readback。
5. 失败保留current attempt和不可逆事实，按同attempt、新attempt或新version/人工处理恢复。

## 影响、风险与兼容性

- 旧runner“调用即dispatch”被安全收紧为显式授权；维护者入口与测试同步迁移。
- Candidate artifact retention缺失会阻塞publish并要求重新形成current Candidate，不允许在publish中重新pack。
- 已成立tag/npm/GitHub事实永不因后续失败或代码回滚而撤销。

## 验收摘要

- 本地每个readiness stage均collect-all且`effects: []`。
- dispatch与workflow使用相同context digest、Candidate evidence和唯一tarball。
- 只有一个`npm-production`job拥有OIDC与公共mutation权限。
- terminal evidence能诚实表达部分成功和最小恢复路径。

## 技术入口

- `services/buildr/tools/release/release-readiness.mjs`
- `services/buildr/tools/release/release-transaction-runner.mjs`
- `services/buildr/tools/release/release-transaction-evidence.mjs`
- `.github/workflows/publish.yml`
