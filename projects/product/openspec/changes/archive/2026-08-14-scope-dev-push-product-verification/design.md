## Context

Buildr 的日常正式研发已经在隔离 Task Environment 中执行 affected Verification，并在 Task Finish 中交付冻结 Candidate、完成远端 readback；需要更新 retained Workspace 时，独立 self-bootstrap runner 继续完成 sync、development identity 与最终 Doctor。当前 GitHub `Verify Buildr` 仍对每个 `dev` push 启动 macOS 与 Windows Development feedback，导致正式交付被重复验证，紧随其后的 self-bootstrap successor 又会取消 source run并生成空 affected plan。

GitHub hosted CI 仍有独立价值：PR 到 `dev` 需要为非 retained Formal Finish 的贡献提供 clean-runner affected feedback；`dev → main` 需要分布式跨平台完整 Candidate；手工 dispatch需要显式诊断；tag workflow负责真实发布物。

## Goals / Non-Goals

**Goals:**

- 取消 `Verify Buildr` 对直接 `dev` push 的自动触发。
- 保留 PR 到 `dev` 的 macOS/Windows affected feedback。
- 保留 `dev → main`、手工 dispatch 和 tag publish 的现有边界。
- 用规范和结构化 workflow 契约测试固定事件责任，避免重新引入重复触发。

**Non-Goals:**

- 不调整 Development feedback 的 OS matrix、affected planner或执行成本。
- 不调整分布式 Candidate shard、required context或发布 workflow。
- 不改变 Formal Verification、Task Finish 或 self-bootstrap runner 的实现。
- 不为绕过正式流程的直接 `dev` push 新增第二套验证 authority。

## Decisions

### 删除 `Verify Buildr` 的 `push` 事件，而不是使用路径过滤

Formal Finish source commit 与 self-bootstrap successor 都属于已受 Buildr lifecycle 约束的直接 `dev` 交付。路径过滤只能消除 successor，仍会把 source commit 的正式本地 Verification再执行一次；删除 `push` 事件才能让 hosted CI 回到独立边界。

备选方案是保留 `push` 并用 `paths` 过滤 Product source。该方案减少空运行但继续重复正式 Verification，因此不采用。

### PR 到 `dev` 继续承担 hosted Development feedback

`dev-feedback` job只在 `pull_request` 且 `base_ref == 'dev'` 时运行。它继续覆盖 macOS 与 Windows，并使用 PR base SHA 形成 changed/affected plan。这样外部贡献、普通 feature branch 和明确需要 clean hosted feedback 的高风险修改仍有入口。

高风险 Windows、Launcher、Host/Workspace Node 或 workflow 修改若需要进入 `dev` 前 hosted 证据，应通过短 PR 到 `dev`；临时诊断可使用 `workflow_dispatch`，但后者保持完整 Candidate 语义。

### workflow 契约测试解析事件集合与 job 条件

契约测试必须证明：

- `Verify Buildr` 顶层事件只有 `pull_request` 与 `workflow_dispatch`；
- 不存在 `push` 事件或 `dev` push branch配置；
- Development feedback 只接受 PR 到 `dev`；
- Candidate 仍只接受手工 dispatch或 `dev → main` PR；
- `Publish Buildr` 的 tag触发保持独立。

测试读取 YAML 结构，不依赖注释或模糊字符串计数作为唯一证据。

## Risks / Trade-offs

- [维护者绕过 Formal Finish 直接 push 未验证内容到 `dev`] → repository规则明确直接交付只来自 Formal Finish；其他代码贡献使用 PR 到 `dev`。本 Change 不把 GitHub CI 变成绕过治理的补偿层。
- [最终 `dev` HEAD 不再显示自动 Product check] → Task Verification、Finish remote readback 与适用 self-bootstrap Doctor继续提供正式证据；准备 `main` 时以 Candidate gate 对精确 PR head SHA 重新形成 hosted完整证据。
- [跨平台问题更晚暴露] → 平台高风险改动通过 PR 到 `dev`取得 affected Windows反馈；完整跨平台门禁仍在 `dev → main` Candidate。
- [未来增加新的 hosted边界时事件集合漂移] → 修改 workflow 必须同步更新 canonical spec与结构化契约测试。

