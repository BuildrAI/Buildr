## Why

发布 `0.1.0-rc.35` 时，两类纯时序问题在产物与代码均正确的情况下触发了 false block，需要人工恢复：

1. `trusted-publish.ts` 在 `npm publish` 成功后只做**一次立即** Registry 回读；npm 传播实际耗时约 4 分钟，单次回读读到 `published:false`，于是把一次成功的发布误判为 `npm-publication-unconfirmed` 并阻塞，必须人工轮询 Registry 再幂等 `rerun --failed` 才能收尾。
2. Runtime launcher 交接的等待预算固定为 `attempts=40 × intervalMs=50`（2 秒），且 `instance-lifecycle.ts` 调用时未覆盖默认值。在负载较高的 Windows CI runner 上，旧实例的认证退出超过 2 秒即抛 `launcher_handoff_shutdown_timeout`；同一份逐字节相同的 launcher 代码在重跑后通过，证明这是环境时序而非逻辑回归。

两者都不改变发布产物的正确性，只把"慢"误判成"失败"。本 change 在不削弱任何保守安全默认（未知发布状态绝不重复 publish、真实 hang 仍快速暴露）的前提下，消除这两类时序抖动。

## What Changes

- **P0｜发布后有界回读轮询**：`publishFrozenArtifact` 在 `npm publish` 返回后，把单次 `registryVersionState` 回读改为**有界轮询**——在限定时间窗内反复**只读**官方 Registry，直到精确 version + integrity 命中（确认）或窗口耗尽（仍按 `npm-publication-unconfirmed` 阻塞，绝不重复 publish）。复用既有 `waitForRegistryRelease` 的轮询/瞬态判定语义，保留 `before.published` 的幂等复用路径不变。
- **P2｜launcher 交接超时预算 CI 感知**：`instance-lifecycle.ts` 在调用 `waitForBuildrWebInstanceExit` / `waitForBuildrWebInstance` 时，按运行环境放大 `attempts`/`intervalMs` 预算；**本地交互默认保持现有 2 秒紧预算不变**，使真实 hang 仍能快速暴露并给出明确错误。仅在 CI（或显式环境覆盖）下放宽，吸收 runner 负载抖动。
- **P1（不做）｜pre-candidate 本地门禁 preflight**：调研后判定不值得做，理由记入 `design.md`。
- **P3（不做）｜放宽 `classifyCandidateFailure` transient 正则**：调研后判定会掩盖真实确定性回归、削弱保守诊断默认，不做，理由记入 `design.md`；其唯一合理诉求（npm-unconfirmed 误判）已被 P0 从源头消除。

无破坏性变更：公开 CLI、HTTP、JSON、错误码语义、npm 发布产物与 tag 语义均不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `open-source-release-governance`：细化"发布并回读同一 tarball"的回读语义——发布后的 Registry 回读 MUST 容忍有界传播延迟，通过**重复只读**收敛，MUST NOT 因单次未命中即重复 publish；只有在有界窗口耗尽后 MAY 报告 `npm-publication-unconfirmed` 并阻塞。

> P2 属于 runtime 内部等待预算的环境感知调优，不改变 `buildr-web-instance-lifecycle` 已承诺的外部行为（错误码、CLI/HTTP/JSON 语义、本地交接时序保持等价），故不新增 spec delta，仅在 `design.md`/`tasks.md` 记录实现与等价边界。

## Impact

- 代码：`projects/product/services/buildr/tools/release/trusted-publish.ts`（P0 回读轮询）；`projects/product/services/buildr/src/web/application/instance-lifecycle.ts` 与 `src/web/infrastructure/instance-runtime.ts`（P2 预算注入）。
- 复用：`tools/release/registry-version-state.ts` 既有 `waitForRegistryRelease` / `isTransientReleaseError` 语义。
- 测试：`tools/release` 下 trusted-publish 回读相关测试；`test/integration/npm-launcher.test.ts` 交接预算相关断言。
- 不影响：发布产物 bytes、tag、GitHub Release、npm dist-tag 语义、branch protection 与受保护 transaction 结构。
