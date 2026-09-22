## Context

动机见 `proposal.md - Why`。当前实现的两处约束塑造了方案：

- `tools/release/trusted-publish.ts:42` 的 `publishFrozenArtifact` 已有清晰的幂等骨架：`before = read()` → `if (before.published) reuse` → `publish()` → `after = read()`（单次）→ `assertRegistryArtifact` → `if (!after.published) blocked(npm-publication-unconfirmed)`。`read()` 即 `registryVersionState(packageName, version)`，只返回 version + integrity，不涉及 dist-tag。
- `tools/release/registry-version-state.ts:124` 已有 `waitForRegistryRelease`：`attempts × delayMs` 的有界轮询，配 `isTransientReleaseError` 判定哪些错误值得重试。它轮询的是 `confirmRegistryRelease`（含 dist-tag transition 断言），比 P0 需要的"version+integrity 命中"更强。
- `src/web/infrastructure/instance-runtime.ts:173/190` 的 `waitForBuildrWebInstanceExit` / `waitForBuildrWebInstance` 默认 `attempts=40, intervalMs=50`；`src/web/application/instance-lifecycle.ts:107-108` 通过两个 thin wrapper 调用它们，且**未传** `attempts`/`intervalMs`，因此实际预算恒为 2 秒。

## Goals / Non-Goals

**Goals:**

- P0：发布成功但 Registry 传播滞后时，回读自动在有界窗口内收敛到 confirmed，无需人工干预。
- P2：CI runner 负载导致的交接慢不再误报 `launcher_handoff_shutdown_timeout`；本地交互体验与真实 hang 的快速暴露保持不变。
- 两处改动都不得削弱保守安全默认。

**Non-Goals:**

- 不实现 P1（pre-candidate 本地门禁 preflight）与 P3（放宽 transient 分类正则）——理由见下方 Decisions。
- 不改变 dist-tag 收敛、tag ensure、GitHub Release、smoke reinstall 等既有发布步骤的语义与时序。
- 不改变 launcher 交接的错误码、CLI/HTTP/JSON 契约与本地默认预算。

## Decisions

### D1（P0）：在 `publishFrozenArtifact` 内对 version-state 回读做有界轮询，而非复用 `waitForRegistryRelease`

`waitForRegistryRelease` 轮询的是 `confirmRegistryRelease`，它额外断言 dist-tag transition（`assertRegistryTagTransition`）。在 `npm publish` 刚返回的瞬间，dist-tag 与 version metadata 的传播进度不一定同步，用它轮询会把"version 已可见但 tag 尚未收敛"误判为需要继续等待甚至抛非瞬态错误。P0 的诉求只是"version + integrity 是否已可见"。

**方案**：在 `publishFrozenArtifact` 内把单次 `const after = await read()` 替换为一个有界轮询循环，循环体仍是现有的 `read()` + `assertRegistryArtifact(after, manifest)`：

- 命中 `after.published`（且 integrity 匹配）→ 立即跳出，走既有 confirmed 分支。
- `read()` 抛瞬态错误（复用 `isTransientReleaseError`）→ 视为尚未传播，继续等待。
- `assertRegistryArtifact` 抛 `registry-integrity-conflict`（非瞬态、conflict）→ 立即停止，不继续轮询（已发布事实冲突必须 fail closed）。
- 窗口耗尽仍未命中 → 保持现有 `npm-publication-unconfirmed` 阻塞分支与 `nextActions` 文案不变。

轮询窗口默认值取**明显大于实测 4 分钟传播**、又不至于让真实失败无限挂起的有界值（如总窗 ~8 分钟、间隔 ~20s），并允许通过 `dependencies`/options 注入以便测试用极小窗口驱动。**绝不**在循环内调用 `publish`——循环体只读。

**备选**：(a) 直接复用 `waitForRegistryRelease`——被否，理由如上（dist-tag 耦合）。(b) 把轮询下沉进 `registryVersionState`——被否，会让一个纯读函数带上重试时序，污染其它调用方（`registryDistTagsState`、CLI `--wait` 已有自己的轮询）。

### D2（P0）：幂等复用路径与 effect 状态语义保持不变

`before.published` 的提前 reuse 分支、`publishEffect.state` 的 `unknown → confirmed/not-confirmed` 迁移、`onEffects` 回调时机均不变。轮询只替换"publish 之后那一次读"。这保证已恢复现场（`rerun --failed` 时 registry-state 已 published）继续走 reuse，不会被新循环影响。

### D3（P2）：在 `instance-lifecycle.ts` 注入环境感知预算，runtime 默认值不动

把预算放在调用方（application 层）而非改 `instance-runtime.ts` 的默认 `attempts=40`，理由：

- runtime 默认是**本地交互**语义，2 秒紧预算能让真实 hang 快速失败并给出明确错误，这是对用户友好的，不能放宽。
- CI 容忍度是**部署环境**关注点，属于 application 编排层，按环境放大才符合职责边界。

**方案**：在 `instance-lifecycle.ts` 计算一个 `handoffWaitBudget`（`{ attempts, intervalMs }`），当处于 CI（`process.env.CI` 为真）或存在显式环境覆盖时放大总预算（如总窗提升到数十秒级），否则保持等价于现有 2 秒。把该预算透传给 `waitForExit` / `waitForInstance` 两个 wrapper。本地默认路径下总预算与改动前**逐毫秒等价**，以满足 `buildr-web-instance-lifecycle` 的"外部行为等价"要求。

**备选**：(a) 直接把 `instance-runtime.ts` 默认 `attempts` 调大——被否，会拖慢本地真实 hang 的暴露。(b) 用固定大预算不分环境——被否，同样损害本地体验。(c) 仅调大测试里的 `waitFor`——被否，本次 false block 来自 **runtime 自身**抛出的 `launcher_handoff_shutdown_timeout`（子进程 pid 实测），不是测试断言超时，调测试 knob 治标不治本。

### D4（P1，不做）：pre-candidate 本地门禁 preflight 不值得做

调研结论：**不实现**。理由：

1. **第二权威风险**：完整候选（`verify.yml` 分片）是发布的唯一验证权威。在 dispatch 前于本地再跑一套门禁，会形成一个可能与候选分歧的第二事实来源，违反工作空间规则对"不得静默建立第二权威"的约束。
2. **本次证据不支持**：rc.35 的确定性 doc/hygiene 问题（悬空链接、隐私路径、超大归档原型）在**冻结前**就已在 `dev` 上修复（commits `edee4877`/`ae9c94db`），从未进入候选；候选真正失败的是 P2（launcher 时序）与发布阶段的 P0，二者都不是廉价本地门禁能提前发现的。
3. **"廉价"前提部分不成立**：`buildr-web` goldens 需要完整前端构建，本地 preflight 跑这些并不快。
4. 边际收益 < 治理风险 + 复杂度。若将来确有价值，应收窄为仅 `open-source-candidate`（无需构建、确定性、与候选同一脚本）的 fast-fail，且明确它只是提前失败、不替代候选权威——留作独立提案，不在本 change 内做。

### D5（P3，不做）：放宽 `classifyCandidateFailure` 的 transient 正则会削弱安全默认

调研结论：**不实现**。理由：

1. `classifyCandidateFailure` 的保守默认（不匹配即 `diagnosis-required`）是**安全属性**，不是待消除的摩擦。放宽 transient 正则去自动重跑更多失败，会把真实的确定性回归（真实 launcher 死锁、真实 publish 失败——它们在日志里同样"看起来像超时"）误判为可自动重跑，掩盖问题。
2. 其唯一合理诉求——npm-publication-unconfirmed 被错误地需要人工诊断——已被 **P0 从源头消除**：发布回读不再误报 unconfirmed，自然不依赖分类器去"认得"它。
3. P2 修复同样减少了 launcher 时序被误归为需诊断的情况。
4. 因此 P3 作为"放宽正则"的提法被否决；不为减少摩擦而弱化保守诊断默认。

## Risks / Trade-offs

- **[P0 窗口设太短仍误报]** → 默认窗口取明显大于实测传播时间（~4min）的有界值；窗口耗尽仍保留原 fail-closed 与恢复文案，不会比现状更差，只是更少触发。
- **[P0 窗口设太长拖慢真实失败]** → 仅对**瞬态/未命中**继续等待；integrity conflict 等非瞬态错误立即跳出 fail closed，不会空等满窗口。
- **[P2 CI 预算放大掩盖真实 hang]** → 仅放大 CI/显式覆盖路径；本地默认逐毫秒不变，真实用户 hang 仍 2 秒暴露。CI 下即便偶有真实 hang，最终仍会抛同一错误码，只是更晚——可接受，因为 CI 的目的是吸收负载抖动。
- **[P2 环境探测不准]** → 以 `process.env.CI`（GitHub Actions 必置）为准并保留显式环境覆盖，探测面窄且可测。

## Migration Plan

纯代码改动，无数据迁移、无 schema 变更、无发布产物变化。随常规 `dev` 交付，经完整候选验证后按既有发布流程纳入 `main`。回滚即还原这两处文件，无副作用。
