## Context

Buildr Core 是所有 workspace 都会读取的通用边界规则；`AGENTS.md` 是 workspace 根的规则入口，并随 package 初始化和 sync 投射到用户 workspace。当前提交信息格式由 Git Operations Skill 说明，Task Finish 也会直接接收 Agent 提供的 Delivery Carrier message；Git Operations 在 Task Finish 中不是始终 required 的唯一提交入口。

现状有两个问题：Core 中的中文提交约定曾被删除，导致没有更具体规则时 Agent 回到英文习惯；产品 OpenSpec 仍把该约定描述为 Core 独立提供。目标是把默认语言放到随包 workspace 规则入口，让所有提交消费者读取同一条 workspace 约定，同时保持 Git Operations 只负责格式、安全边界和操作结果。

## Goals / Non-Goals

**Goals:**

- 让默认 package 生成或同步的 workspace 在没有更具体约定时明确要求中文 commit message。
- 让 Git Operations、Task Finish 和直接提交路径都遵循同一条 workspace 规则。
- 删除 Core 对提交语言的责任与独立生命周期契约，避免 Core 与 workspace 规则重复拥有同一事实。
- 保持 Conventional Commits、scope/type 选择、精确暂存、push range 检查、Task trailer 和历史安全边界不变。

**Non-Goals:**

- 不改写既有提交，不新增 commit hook、lint 或 CLI 强制拒绝英文。
- 不由产品自动翻译、从 diff 推断或替 Agent 生成提交语义。
- 不把提交语言写入 Task Record、Task Finish persistence 或新的 capability store。
- 不改变 Project、Service、repository 更具体约定覆盖 workspace 默认值的能力。

## Decisions

### 1. 默认语言归随包 workspace `AGENTS.md`

在 `package/targets/workspace/AGENTS.md` 增加一条独立规则，明确默认 commit message 使用中文，并允许 `type`、`scope`、代码标识、路径和专有名词保留原文。该文件是 workspace 规则入口，会随初始化和 sync 进入用户 workspace；它比 Core 更具体，又能覆盖不依赖某个可选 Skill 的所有提交路径。

备选方案是继续放在 Core：会让通用 Core 继续拥有仓库偏好，并重复表达 workspace 规则，不采用。只放 Git Operations：无法覆盖 Task Finish 的直接 Delivery Carrier 和 Git Operations 被替换/卸载的情况，也不采用。

### 2. Git Operations 保留格式与安全责任

Git Operations Skill 继续定义 Conventional Commits、type/scope、正文、精确 staging、push range 和 fail-closed 边界；它只声明提交语言遵循当前 workspace、Project、Service 和 repository 规则，不复制一份独立语言政策。Task Finish Skill 同样明确其 `--commit-message` 输入遵循当前 workspace 规则，但不新增语义生成器。

### 3. 通过 OpenSpec 和 package conformance 防止归属回退

Canonical specs 删除 Core 默认提交语言及其独立生命周期要求，新增随包 workspace `AGENTS.md` 的默认语言要求，并把 Git Operations 的语言场景改为遵循当前 scope 规则。Contract tests 检查随包 AGENTS 文案存在、Core 不再声明该责任、Git Operations/Task Finish 引用 workspace 规则；不把英文提交变成硬性 Git runtime 错误。

## Risks / Trade-offs

- [已有 workspace 不会因产品源码改变自动更新] → 通过正常 `buildr sync` 投射新 `AGENTS.md`；本次 Buildr 自举 workspace 在正式交付后按既有 self-bootstrap 流程激活。
- [更具体的仓库规则可能继续使用英文] → 这是明确允许的覆盖行为；测试只要求默认规则存在，不强制覆盖更具体约定。
- [Agent 仍可能忽略规则] → 保留 Git Operations 和 Task Finish 的入口提示及契约测试；不新增未经授权的 commit hook 或隐藏拒绝。
- [不同消费者读取到的规则上下文不完整] → Task Finish 与 Git Operations 都在 Skill 中明确引用当前 workspace scope 规则，并由组合测试覆盖。

## Migration Plan

1. 在 Change delta 中删除 Core 默认提交语言相关 requirements，新增随包 workspace `AGENTS.md` requirement，并修改 Git Operations 的语言 requirement。
2. 修改 package workspace `AGENTS.md`、Core、Git Operations、Task Finish 及对应 source/package parity tests。
3. 运行 OpenSpec strict validation、package/contract focused tests 和受影响 Product verification。
4. 收敛并归档 Change；正式交付后让 Buildr 自举 workspace 执行现有 sync/activation，用户 workspace 通过后续 sync 获得规则。

## Open Questions

无。
