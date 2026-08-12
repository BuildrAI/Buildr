## Context

当前 finish run 已持久化 13 个标准步骤，并可验证、保存和执行调用方提供的 execution plan。问题在于 plan 的 command、cwd、args、handler、assertion 与 evidence id 仍由 Agent逐项拼装；产品只能判断计划是否落在有限 allowlist，无法回答“当前步骤应做什么”。部分步骤是纯确定性 CLI 动作，部分步骤必须调用语义 provider，另有少量真正未覆盖或运行时歧义的异常路径。

## Goals / Non-Goals

**Goals:**

- 以版本化 registry 成为标准 finish action 的唯一产品事实，覆盖全部标准 step。
- 区分 `product-executable` 与 `agent-provider`：前者由产品解析并执行，后者给出已登记 provider handoff，不要求 Agent 猜命令。
- 只有 registry miss、输入无法唯一解析或登记动作报告语义分支时，返回 `agent-reasoning-required`。
- 保持现有 run、attempt、lease、fingerprint、evidence、recovery 与 completion receipt 语义。
- 提供稳定查询输出，便于 Agent、测试与后续 registry 扩展使用。

**Non-Goals:**

- 本 Change 不把 current knowledge、asset review、Git 语义决策或 repair 判断硬编码成 shell 命令。
- 不创建第二套 workflow 状态，不让 registry 绕过 provider contract、用户授权或 formal assurance repair boundary。
- 不在本 Change 内实现所有未来异常分支；未登记分支必须显式 fallback。

## Decisions

### 1. Registry 是产品 application model，不是 Skill 内静态命令表

新增 `task-finish-action-registry.mjs`，每个 entry 固定声明 `id`、`step`、`kind`、`applicability`、`executionSurface`、`effects`、`authorization`、`resultContract`、`evidenceProjection` 和 `fallbackPolicy`。`product-executable` entry 另外持有受控 resolver，由 run identity 和结构化 action context 生成 execution plan；`agent-provider` entry 只返回 capability/provider action contract。

选择该方式是因为 Skill 文本仍要求 Agent 解释命令，而 application registry 可被 CLI、executor 和测试共同消费。未采用通用 shell 配置文件，避免把任意命令执行扩展为配置注入面。

### 2. Registry resolution 返回四态结果

resolver 返回：

- `ready`：唯一 entry 且所有输入齐备；产品可直接执行或交接登记 provider。
- `input-required`：entry 已覆盖，但缺少明确 context 字段；返回字段清单，不要求 Agent猜命令。
- `agent-provider-required`：标准语义动作已登记，Agent 按 capability contract 调用 provider。
- `agent-reasoning-required`：没有覆盖、多个 entry 同时匹配或动作进入登记外语义分支。

只有最后一态代表用户所说的“由 Agent 去推理”。这样不会把语义 provider 的正常专业动作误报成 registry 缺失。

### 3. `run` 优先 registry，显式 plan 仅作兼容覆盖

`task finish run` 在当前 step 无显式 execution plan 时调用 registry resolver，并把 action context 作为结构化事实输入。已存在的 `--execution-plans` 保持兼容，用于历史调用方和登记外恢复，但结果标记来源为 `caller-supplied`；registry 计划标记为 `registry` 并绑定 registry version/action id。产品生成的 fingerprint 绑定 action entry、run identity、context 与 executable identity，避免 Agent 逐项提供。

### 4. 全步骤覆盖不等于全步骤 shell 自动化

context、OpenSpec convergence、runtime convergence 与 formal assurance 等确定性入口可以是 `product-executable`。current knowledge、commit/rebase/push、asset review、archive 和 cleanup 等在现阶段以 `agent-provider` 方式登记，精确给出 capability、action、所需 evidence 与执行 surface。后续可在不改变状态机的情况下把某 entry 升级为产品 executor。

这种取舍保证不再“猜命令”，同时不把 Git 冲突、知识语义或删除授权错误地宣称为确定性。

### 5. Registry 查询是 `task finish actions`

新增只读 action：可列出 registry，或结合 `--run` 返回当前 step 的 resolution。JSON 返回 registry schema/version、entry source、resolution、required inputs、execution preview/provider handoff 和 fallback。查询不领取 attempt、不写 finish run。

## Risks / Trade-offs

- [初期 product-executable 覆盖有限，耗时下降不会一次达到最终目标] → registry 覆盖所有标准步骤并明确 kind，后续按 benchmark 把稳定 provider action逐项下沉，不再改调用契约。
- [registry 与 CLI 漂移] → action resolver 在执行前核验 executable、cwd、参数与 result contract，并用 contract/architecture tests 覆盖全部 FINISH_STEPS。
- [显式 plan 兼容入口继续被滥用] → 输出 plan source 和 coverage，文档将 registry 设为默认；caller-supplied 只作为兼容/恢复路径。
- [自动动作扩大副作用] → entry 固定 effects、authorization 与 shared mutation，resolver 不接受调用方覆写命令或 effects。

## Migration Plan

1. 增加 registry 与纯解析 API，不改变旧 executor。
2. 接入 `actions` 查询和 `run` 默认解析，保留显式 plans。
3. 更新 Task Finish Skill/文档，让正常收尾先调用 registry 驱动的 `run`。
4. 用 unit、CLI integration、contract 与 affected 验证确认兼容性；失败可回滚到显式 plan 路径，不迁移已有 run 数据。

## Open Questions

无。后续哪些 `agent-provider` 动作值得升级为 `product-executable`，由真实 completion metrics 和失败分布决定。
