# 协调多个 self-bootstrap Finish 恢复

## 一句话摘要

让 Buildr 自举 runner 在被其他合法 Finish carrier 阻塞时，一次说明每个现场属于谁、应先由哪个 owner 做什么，以及为什么当前 activation 必须等待。

## 背景与问题

doctor-blocked Finish 会保留 run-owned carrier，供 self-bootstrap activation 后恢复同一 run。另一个已交付但 cleanup pending 的 Finish 也可能暂时保留自己的 carrier。当前 runner 只能排除当前 run 的目录，因此会安全地把另一个合法 carrier 当作 foreign dirty path阻塞，却不能直接给出完整 owner 和恢复顺序。

## 目标与非目标

目标是在所有副作用前只读识别固定 carrier 根下的候选 run，通过现有 Product inspect 证明 ownership 和 resume facts，并生成“先由各原 Finish owner cleanup，再重试当前 self-bootstrap”的结构化计划。非目标是自动删除 foreign carrier、跨 owner 恢复、增加队列/数据库/Receipt，或把该能力交付给普通用户 Workspace。

## 受影响角色

- 在 Buildr 自举 Workspace 执行正式收尾与恢复的 Agent。
- 审核 owner action、删除范围和 activation effects 的人类用户。
- 维护 Task Finish、Task Environment 与 self-bootstrap authority 边界的 Buildr 开发者。

## 核心流程

runner 先 inspect 当前 run，再枚举固定 carrier 根的直接子目录；每个 foreign 目录都必须由 matching Finish Result证明 run、Workspace、真实路径、carrier identity 和 resume identity。可证明的 `cleanup_pending` run成为原 owner cleanup predecessor；不支持或不可证明的条目保持 blocked。所有 predecessor 消失后，当前 runner才进入原有 sync、Git、安装、Doctor与same-run resume。

## 关键变化

- 一次返回全部 carrier observations 与 owner-ordered steps。
- 对可恢复 cleanup 给出原 owner command、授权点和预期 effects。
- 当前 runner 不执行 foreign action，不把 foreign path 加入 ignored roots。
- symlink、未知 run、identity/token 漂移和不支持状态继续零副作用 fail closed。

## 影响、风险与兼容性

正常无 foreign carrier 的路径保持不变；无需 migration 或新 Product API。预检会增加少量只读 Product CLI 调用。恢复计划只存在于当前 Result，不持久化，也不改变 Finish、Environment 或Task authority。

## 验收摘要

多个合法 cleanup predecessor 能一次形成确定性计划；按计划由原 owner 清理后当前 runner可重试。任何未知、漂移或不支持条目都阻断全部 activation effects，且没有 carrier 被忽略、删除或跨 owner 修改。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [task-closeout-orchestration delta](specs/task-closeout-orchestration/spec.md)
- [tasks.md](tasks.md)
