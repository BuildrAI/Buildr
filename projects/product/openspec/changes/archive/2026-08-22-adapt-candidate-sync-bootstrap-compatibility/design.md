## Context

新版候选 CLI 已能识别 linked candidate/self-checkout，但当前 retained Task Environment controller 在升级前仍调用 `sync`。直接抛错虽然零写入，却让负责交付修复的正式 Task 无法恢复 ready，形成自举升级死锁。

## Goals / Non-Goals

**Goals:**

- 兼容上一版 retained controller 的候选 `sync` 调用。
- 保证该调用只发生 runtime projection，零 Workspace source/store mutation。
- 保持显式诊断，让调用者迁移到 `render --product-skill`。

**Non-Goals:**

- 不恢复候选 self-checkout 的完整 source sync。
- 不把 Task Receipt 变成普通 CLI 的权限门禁。
- 不改变 retained/isolated target 的既有合法行为。

## Decisions

sync target authority preflight 返回 `projectionOnly` classification，而不是对 linked candidate/self-checkout 抛错。`syncRuntime` 在任何 workspace 初始化与 source plan 之前消费该分类，直接调用 `renderRuntime(..., { productSkill: true })`，输出兼容提示后返回。这样旧 retained controller 获得成功 projection，随后仍用候选 `runtime check` 证明 identity。

不通过父进程、环境变量或 Receipt 猜测 caller，因为旧 controller 没有稳定授权标记；Git source/target identity 已足够证明需要保护的 mutation 边界。

## Risks / Trade-offs

- [手工在 linked candidate/self-checkout 运行 `sync` 不再执行完整 source sync] → 命令输出明确实际模式；完整验证必须指定独立 Workspace。
- [兼容分支长期存在] → 新 Task Environment 直接调用 render，兼容分支只为旧 retained controller 和人工误用提供安全收敛。

## Migration Plan

交付后 retained Task Environment 开始显式使用 render；旧 retained controller 在本次交付期间通过兼容分支完成 Environment、Verification 与 Finish。无数据迁移。

## Open Questions

无。
