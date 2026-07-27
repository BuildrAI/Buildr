## Context

`managed-mutations` 验证已覆盖生产 application 函数，但近期 OpenSpec 收敛和 Task Finish 诊断功能在 application 层直接调用 `fs.mkdirSync`、`fs.writeFileSync` 与 `fs.rmSync`。这些路径虽然主要操作临时文件或诊断文件，仍绕过 runtime 注入的文件系统能力，使失败注入、atomic write 与生产 mutation 审阅边界不一致。

## Goals / Non-Goals

**Goals:**

- 消除当前 6 处直接 mutation finding。
- 让相关 application 路径通过 runtime 注入的 `ensureDirectory`、`atomicWriteFile` 和精确清理入口执行。
- 保持 OpenSpec 收敛、Task Finish 输出和清理行为兼容。

**Non-Goals:**

- 不重构全部文件系统基础设施。
- 不改变 OpenSpec 同步算法、Task Finish 状态机或公共 JSON 契约。
- 不扩大 `managed-mutations` 的扫描范围或 allowlist。

## Decisions

1. **复用现有 runtime 文件系统能力。** application domain 已通过共享 runtime 组装基础设施能力；新增最小的 `removePath` 入口，并复用 `ensureDirectory`、`atomicWriteFile`。相比在各模块内部新建 helper，这能保留统一注入与审阅边界。
2. **临时文件也使用 atomic writer。** 临时投射随后会被独立 OpenSpec 进程读取，atomic write 能避免半写入；额外 rename 成本相对验证流程可忽略。
3. **清理保持精确目标。** `removePath` 只接收调用方已解析的临时根目录，本 Change 不引入宽泛目录清理或新的 workspace transaction。
4. **由现有 gate 作为主要回归。** `managed-mutations` 直接验证生产路径未绕过入口；相关 OpenSpec 与 Task Finish 契约测试验证行为未变。

## Risks / Trade-offs

- [Risk] 新增基础设施入口可能被误用于未校验的受管资产路径 → 该入口保持低层能力，只由已有 application 流程传入精确路径；受管资产仍需使用 transaction 和安全路径校验。
- [Risk] atomic writer 改变临时文件落盘步骤 → 通过现有 OpenSpec 收敛测试和完整 Candidate 验证兼容性。
- [Risk] 清理异常可能掩盖主流程异常 → 保持当前 `finally` 传播行为，不改变错误优先级。
