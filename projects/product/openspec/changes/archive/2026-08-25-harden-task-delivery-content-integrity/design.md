## Context

Buildr 当前已有两条有效边界：本地 `test:changed`/`test:candidate` 用同一去重 DAG 先执行 Fast admission；Task Finish 在机械应用冲突后允许 Agent 在 run-owned Delivery Carrier 中完成语义适配，并明确标记 `agent-reviewed-not-proven-by-buildr`。这两条边界应保留。

剩余缺口都属于“内容集合没有闭合”：Fresh Build fixture 手工复制 HTTP contract/generator/DTO 文件，新增文件可能遗漏；Delivery Adaptation 只证明 carrier 自身 clean、baseline/commit/identity 稳定，没有逐项说明原 Task Contribution 的每个路径去了哪里。后者曾造成 35 个交付路径中只提交 2 个冲突文档仍被接受。

本变更跨 Product verification test policy 与 Task Finish，但不改变 Task Development、Verification Result、Candidate 或 Environment 的 authority。

## Goals / Non-Goals

**Goals:**

- 在现有 Fast admission 内、重型 verifier 启动前发现 HTTP 契约 fixture/generator/DTO 闭合错误。
- 让 Agent-reviewed Delivery Adaptation 对原 Task Contribution 的每个路径形成可审计处置，禁止静默遗漏。
- 保留 Agent 的语义判断权，并把 Buildr 的硬门禁限制在“路径未处置会导致完成误报”这一结果不变量。
- 返回紧凑、稳定、可恢复的诊断，不引入第二 Result 或事件历史。

**Non-Goals:**

- 不要求 adapted carrier 的整体 tree delta 与原 patch 机械相等。
- 不把 Fast admission 扩展为所有 Project 的通用验证层级。
- 不实现正式 Verification runtime 的 deadline、进程组、TERM/KILL、有界输出、Browser runner 或资源模型。
- 不新增数据库表、Task 状态、自动重试、自动合并、force push 或语义等价算法。

## Decisions

### 1. 复用 Fast admission，不新增验证阶段

HTTP contract fixture completeness 作为低成本 Contract/Static owner 进入现有 Fast admission。生成器继续拥有 Schema → DTO drift；新增一个测试侧闭合 inventory，使 Fresh Build fixture 从同一 inventory 取得需要复制的 generator、Schema 与生成输出，而不是维护第二份散落列表。Contract test 校验所有登记文件存在、输出覆盖 Buildr 与 Buildr Web 两端，System fixture 继续证明真实 npm-ci 与 build:web。

选择该方案是因为现有 admission 已保证所有非 admission step 等待 Fast；只需补 owner，不需要跨 invocation cache、preflight Result 或新调度器。直接复制整个源码目录会掩盖 package/fixture 边界，保留手写列表又会重复原缺陷，因此都不采用。

### 2. Delivery Adaptation 使用逐路径覆盖证明

Task Finish 从冻结 `TaskContribution` 计算完整路径集合，并对每个路径分类：

- `target-contained`：当前 delivery baseline/target 已精确包含任务 source 的 after state；
- `carrier-changed`：adapted carrier 相对 delivery baseline 实际改变该路径；
- `agent-reviewed-target`：字节不精确相等、carrier 也没有改变该路径，但 Agent 显式确认目标现状已语义承接，并提供非空的逐路径理由。

三类并集必须精确覆盖 Task Contribution 路径；未知路径、重复处置、空理由或缺失路径全部 blocked。Buildr 只证明分类、Git bytes、identity 和输入闭合，不把 `agent-reviewed-target` 宣称为机器证明的语义等价。

`agent-reviewed-target` 通过现有 run resume 的 closed 一次性输入提交，并进入现有 Delivery Carrier/proof value；不创建独立 store。已有显式 zero-delta adaptation 继续使用相同覆盖规则，不获得全路径隐式豁免。

仅要求 exact containment 会把合法冲突判断收回 Buildr；继续使用 task-wide `agent-reviewed` 又无法发现静默遗漏。逐路径覆盖在两者之间保留 Agent 判断，同时让遗漏变成显式事实。

### 3. 同一覆盖证明贯穿 adoption、deliver、cleanup

Carrier adoption 先形成覆盖证明；`verifyGitTaskContributionCarrier`、remote delivery readback 和 Environment cleanup proof 都重验同一 closed proof identity。任何阶段发现 Task Contribution、baseline、carrier tree、target ref 或逐路径输入漂移，均返回 stale/blocked，不沿用旧证明。

诊断只返回稳定 code、缺失/冲突路径、已分类数量和唯一恢复方向；不返回完整 patch、stdout、绝对临时路径或语义结论。

### 4. 保留替代交付方式

自动 Finish 被路径覆盖阻断时，Agent仍可修改当前 run-owned carrier、改走 PR 或直接 Git。外部交付完成后，Delivery Reconciliation 继续从真实 remote target证明 Task Contribution；Buildr 不因自动路径失败而禁止无关工作。

## Risks / Trade-offs

- [逐路径人工处置可能增加少量输入成本] → 只要求未被 exact target/carrier 自动覆盖的路径，默认路径无需人工填写，并提供紧凑缺失列表。
- [Agent 仍可能错误判断语义] → Result 明确保存“Agent reviewed、Buildr 未证明”，不把该判断升级为机器事实；本变更只消除静默遗漏。
- [共享 fixture inventory 可能成为新的测试耦合点] → inventory 只服务 Product test tooling，不进入 npm runtime、Project declaration 或公共 API，并由 Contract owner校验。
- [现有 adaptation proof 兼容] → reader 对旧 proof 保持历史只读；新 run 必须生成含 coverage identity 的新 proof，不回填旧记录。
