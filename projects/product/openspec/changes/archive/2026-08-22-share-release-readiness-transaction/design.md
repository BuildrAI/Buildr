## Context

P1-A 已把 release selection/freeze 变成可重建的 Git provenance read model，P1-B 已让 `verify.yml` 的唯一 `candidate-package` 与 `candidate-aggregate` 绑定 release source，P1-C 已提供只引用 Task/Finish/self-bootstrap owner facts 的 correlation read model。当前 `release-transaction-runner.mjs` 仍把候选运行、Task、Environment、main/dev 和 workflow 检查写成 fail-fast dispatch 前置逻辑；`publish.yml` 又在自己的 `candidate` job 重新构建 payload并执行 `npm pack`。因此本地检查无法 collect-all，dispatch 与 hosted job没有共享完整 context，正式 workflow 也没有真正消费 P1-B 的冻结 artifact。

这项能力跨越 checkout-only release adapter 与唯一 hosted workflow，但不改变各专业 owner、Task persistence 或公开 npm bytes authority。维护者、发布 Agent 和 GitHub protected environment 是主要参与方。

## Goals / Non-Goals

**Goals:**

- 用一个 closed builder组合 selection、release、Candidate aggregate/artifact、main/dev、Task correlation、Environment、exact Node 与 workflow identity。
- 让 `pre-candidate`、`pre-main`、`dispatch-check` 和 hosted `pre-tag` 共享相同 schema、finding codes与currentness规则；dispatch后的 workflow逐字节核对同一 context digest。
- 所有本地 readiness 都返回完整 findings、hosted deferred checks、next actions和`effects: []`。
- `publish.yml` 从 matching Candidate run 下载 P1-B 已冻结的 `candidate-package` 与 `candidate-aggregate`，不再 build、pack或重跑完整 Candidate。
- 在唯一 `npm-production` job内保留每个不可逆步骤的current attempt evidence，并给出安全恢复分类。

**Non-Goals:**

- 不实现release branch create/update/freeze、Product Candidate生成、Task evidence writer、release→main、main→dev或branch cleanup。
- 不新增Task Record字段、SQLite表、第二workflow、第二Environment job、本地OIDC模拟、token fallback或第二份tarball。
- 不试图让不同GitHub run共享同一次Environment approval；明确的新attempt仍可能重新审批。

## Decisions

### 1. 独立共享 context 与 readiness 两种契约

新增`release-readiness.mjs`，形成`buildr.release-context/v1`和`buildr.release-readiness/v1`。Context只保存owner projection、portable locator/identity/digest、阶段所需source和稳定identity；Readiness保存stage、context identity、`ready|blocked`、全部findings、hosted deferred checks、next actions与空effects。

同一builder允许早期阶段的可选事实暂缺，因此`pre-candidate`与`pre-main`的context identity会随owner facts补齐而更新；它们共享schema、lineage与finding semantics，但不会伪装成最终dispatch digest。`dispatch-check`冻结完整context；workflow输入同时携带context JSON和`context_digest`，contract与protected job都重新计算并要求完全相等。选择这一方案而不是固定一个从pre-candidate开始永不变化的digest，是因为Candidate、main和workflow run在早期客观不存在，固定digest只能接受caller占位或隐藏漂移。

### 2. Readiness collect-all，dispatch adapter显式授权

Builder只做纯校验；外部readers负责从Git、GitHub、Task Application和文件读取current facts。每个检查追加stable finding，不因第一项失败终止。finding至少包含`code`、`severity`、`owner`、`expected`、安全可公开的`actual`与`nextAction`；hosted-only的OIDC、approval、run/attempt和Registry mutation前readback进入`deferredChecks`，不得在本机模拟。

`release-transaction-runner.mjs`提供readiness和dispatch两个明确动作。默认/`readiness`只返回无副作用Result；`dispatch`必须同时满足完整`dispatch-check`和显式`publicationAuthorized: true`输入，之后才允许唯一`gh workflow run` effect。选择显式输入而不是根据命令名称或Task状态推断授权，可以避免普通候选准备跨过公共mutation边界。

### 3. Candidate run是唯一artifact来源

共享context记录Candidate run id/attempt、aggregate identity和artifact identity。`publish.yml` contract job使用`actions/download-artifact`从该Candidate run下载`candidate-aggregate`和`candidate-package`；先验证aggregate passed、source/registry/artifact identity一致，再把同一目录作为所有Host Node、Launcher和protected transaction的输入。

删除publish workflow的payload build、`npm pack`与attempt内candidate artifact fallback。若Candidate artifact缺失、过期或bytes不匹配，readiness/workflow在公共mutation前blocked，并要求对current release source形成新的Product Candidate；不能在publish run内补造。相比保留旧candidate job，这一选择真正落实P1-B owner边界并使“一个source一份tarball”可证明。

### 4. Protected transaction形成逐步attempt evidence

terminal evidence升级为能表达current run/attempt与步骤facts的closed schema。步骤按`oidc → pre-tag → tag → registry-before → npm → dist-tag/readback → GitHub Release → Registry smoke`记录`passed|failed|not-reached`和可公开引用；tag/npm/GitHub事实始终从正式readback形成，不接受runner预填成功。

恢复分类为：

- `same-attempt`：尚未产生不可逆事实且GitHub允许同一attempt继续的瞬时步骤；
- `new-attempt`：run/attempt已结束或hosted identity必须刷新，重新审批但仍消费同一context/artifact；
- `blocked-new-version`：同version/tag/integrity或source发生不可接受漂移，只能人工处理或选择新version。

不自动删除tag、unpublish、移动release或覆盖Registry。相比只保存最终`passed|failed`，逐步evidence可以诚实表达部分成功；相比建设发布数据库，Actions artifact仍是既有terminal authority。

### 5. 保持唯一protected owner和权限拓扑

`publish.yml`仍只有`release` job声明`environment: npm-production`、`id-token: write`与`contents: write`。contract和artifact验证是可逆的unprotected jobs；Host Node/Launcher可继续消费同一Candidate artifact，但不得重新生成bytes。protected job在OIDC后再次运行共享`pre-tag` evaluator，核对source、context digest、Candidate、artifact、workflow、run/attempt与remote main，然后才进入tag preflight/ensure。

### 6. Skill与checklist只解释入口，不复制规范

`buildr-release`与release checklist明确两步边界：先readiness、再由维护者授权dispatch；结果展示全部findings/deferred checks，并在失败后按attempt evidence选择恢复。它们引用公开runner/schema，不维护第二套检查字段或成功判定。

## Risks / Trade-offs

- [跨run下载Candidate artifact受retention或权限影响] → dispatch前和workflow contract均读取artifact metadata并验证bytes；缺失时回到current source的新Candidate，不在publish中重建。
- [Context JSON作为workflow input可能接近平台长度限制] → 只保存最低充分projection和digest，不嵌入专业Result、stdout或attempt history；大型证据用run/artifact locator引用。
- [早期context identity与最终digest不同易被误解] → Result显式携带stage、lineage identity和frozen状态；只有`dispatch-check`的完整context可进入workflow。
- [attempt evidence finalize本身失败] → 每个不可逆步骤先写current working evidence，`if: always()`上传；inspect允许报告partial/unknown且不反推未读取事实。
- [旧调用者仍期待runner默认dispatch] → 这是有意的安全收紧；调用方必须显式选择dispatch并传入publication authorization，Skill/checklist同步迁移。

## Migration Plan

1. 先增加共享context/readiness模块、schema验证和纯函数测试，同时兼容读取旧transaction context用于诊断。
2. 将runner改为readiness默认和显式dispatch；迁移单元/集成测试到collect-all与authorization边界。
3. 修改`publish.yml`从Candidate run下载artifact/aggregate，删除本地pack job，并在contract与protected job验证同一context digest。
4. 升级terminal evidence与inspect，覆盖tag前失败、tag后npm失败、npm后readback失败和新attempt恢复。
5. 同步Skill、checklist、Brief/current knowledge与workflow contract测试；完成Change收敛后再形成Formal Verification evidence。

尚未dispatch的代码可直接回滚。已存在公开tag/npm/GitHub事实时不得通过回滚删除；继续使用匹配context/artifact的新attempt恢复，或由维护者选择新version。

## Open Questions

无。GitHub artifact retention导致的不可恢复缺失按“重新形成current source的Product Candidate”处理，不在本Change引入长期artifact store。
