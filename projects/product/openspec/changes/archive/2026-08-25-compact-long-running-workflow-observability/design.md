## Context

Buildr 已有四类可恢复 authority：Verification 的 Task Execution Record、Finish maintenance 中的 self-bootstrap evidence、GitHub hosted release evidence artifact，以及每个 Task 的 Retrospective current。问题不在于缺少完整事实，而在于 producer/CLI 往往把完整 Result 直接写到 stdout；长流程完成后，Agent 得到的展示可能被工具截断，无法仅凭当前响应判断 terminal truth，也没有一致的下一步指针。

self-bootstrap runner 还存在一个特殊缺口：成功结果会刷新 Finish maintenance，阶段失败只返回完整 blocked JSON，stdout 丢失后没有同形 readback。任何修复都必须保持唯一 runner、正式 Verification、release protected transaction 与完整审计 evidence 的 owner 边界。

## Goals / Non-Goals

**Goals:**

- 让长流程默认 stdout 始终有界，并用同一 compact summary 语义表达运行、终态、首要失败、清理和唯一恢复入口。
- 让 summary 只引用专业 authority；stdout 截断、客户端断连或等待超时后，Agent 可通过一次 inspect 判断当前事实，而不是重跑 producer。
- 保留显式 full detail 和完整审计 evidence，且在输出压缩前先完成 terminal persistence。
- 为批量结果同时实施数量与 UTF-8 字节边界。

**Non-Goals:**

- 不建设事件平台、实时进度推送、通用日志数据库、队列、自动 retry 或第二套 workflow Result。
- 不估算未知终态，不把 `running` 推断成失败，也不让 compact summary 成为 Verification Result、Finish Delivery、release evidence 或 Retrospective authority。
- 不改变现有验证范围、发布审批、self-bootstrap 唯一 runner、审计保留与失败恢复安全边界。

## Decisions

### 1. 公共 summary 是投影，不是新 authority

新增 closed `buildr.long-running-operation-summary/v1`。固定字段为 operation、detail、terminal status、run/result identity、关键 stages、primary failure、cleanup、output boundary 与唯一 recovery pointer。每个 owner 从自己的 current/durable fact 投影 summary；summary 不持久化、不参与 identity 计算，也不复制完整正文。

替代方案是建立统一 workflow run 表。它会复制 Execution Record、Finish、release artifact 与 Retrospective 的状态并引入一致性问题，因此不采用。

### 2. 先持久化 terminal truth，再输出 compact

Verification 先 seal Task Execution Record；release 先形成 output/evidence artifact；self-bootstrap 在可识别 Task/run 后无论 passed 或 blocked 都尝试刷新既有 Finish maintenance；随后才生成 stdout summary。持久化 attention 不覆盖业务 terminal truth，summary 同时表达 owner status 与 evidence/cleanup attention。

进程在 authority open 之后不可捕获死亡时保持 `running/open`；inspect 必须返回 open，而不是根据超时推断 failed。只有既有 owner 的受控 recover 或显式 unknown 授权可以终结未知 Verification。

### 3. 默认 compact，显式 full，恢复指针保持结构化

self-bootstrap、formal Verification 与 release transaction 接受 `--detail compact|full`，缺省为 compact。`full` 返回既有 canonical payload；compact 不携带绝对路径、raw argv、完整 diagnostics、operations 或正文。恢复入口使用结构化 owner/operation/Task/run/record identity，不保存 shell 字符串、token 或本机 locator。

Task Retrospective list 继续是自身 closed list schema，不强行伪装为长流程 terminal summary；它复用相同 bounded-output 规则，默认摘要，正文只在显式 include 或单 Task inspect 时出现。

### 4. 字节边界按完整语义项截断

所有 compact payload 在序列化后必须低于固定公共上限。阶段列表和批量 items 只在完整对象边界加入；超限时停止追加并返回 matched/returned count、UTF-8 bytes、`truncated: true` 与 inspect 指针。不得截断 JSON token、UTF-8 字符或关键 identity/failure/recovery 字段。

### 5. 防重跑由 durable identity 决定

Verification 命中 matching active/terminal Execution Record 时只返回现有 record 的 compact summary；默认不得启动 capability。self-bootstrap inspect 到同一 Finish run 的 maintenance/terminal evidence后按现有幂等 plan 恢复，不能因 stdout 丢失启动第二 runner。release inspect 只读取 matching hosted run artifact，不 dispatch 新 workflow。

## Risks / Trade-offs

- [默认 JSON schema 变化会影响旧脚本] → 作为明确 breaking change，保留 `--detail full`，同步更新 bundled Skills、help、registry 与 checkout/npm parity 测试。
- [self-bootstrap blocked maintenance 写入自身失败] → 保留原 blocked 事实并在 summary 标记 evidence attention；不得回滚已发生 activation effects，也不得自动重跑。
- [compact 过度压缩导致诊断不足] → primary failure 与唯一 inspect pointer 永不因预算省略，完整 diagnostics 仍由 owner detail/readback 提供。
- [批量正文单项就超过预算] → 不返回半截 report；标记截断并要求单 Task inspect。

## Migration Plan

1. 先登记公共 summary schema、projection helper 和边界测试。
2. 逐个迁移 Retrospective list、Verification、release transaction 与 self-bootstrap；每个入口同时保留 explicit full。
3. 更新 bundled Skills 和 component integrity，使 Agent 默认消费 compact 并在需要时按 pointer inspect。
4. 不迁移 SQLite、旧 Execution Record、旧 Finish maintenance 或历史 release artifacts；旧 authority 继续可读并可生成 compact 投影。

回滚时可恢复旧默认 full 输出而不迁移数据；已经写入的 owner facts与 evidence 不受影响。

## Open Questions

无。公共字节上限与每个 owner 可保留阶段集合由实现常量固定，并由 contract tests 锁定，不作为用户配置面。
