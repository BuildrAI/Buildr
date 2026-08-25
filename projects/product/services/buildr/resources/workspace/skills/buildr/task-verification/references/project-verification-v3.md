# Project Verification Declaration v3

`projects/<project>/verification.yml` 只声明已经存在、团队确认可调用的少量测试能力族。文件可缺省；缺省或无适用能力形成 coverage gap，不触发测试开发。

## Closed schema

顶层仅允许 `schemaVersion: buildr.project-verification/v3`、`resources` 和 `capabilities`。每项 capability 必须声明：

- 稳定 `id`、Project/Service `scope`；
- 非空 `proves`、`static|unit|component|integration|system` `evidence`；
- `task-delivery|product-candidate|published-release` `usableFor`；
- 可信 `discovery.sources`；
- 必需的 `invocation.full` 与可选 `invocation.affected`，入口为 `command|agent|provider`；
- `environment`、`effects`、`resourceClaims` 的真实执行边界。

单个 v3 文件不接受 v2 字段。runtime 另有只读 legacy v2 compatibility reader，但它不属于 authoring contract，也不提供 v2 writer 或 template。新声明不要写 `applicability`、`requiredForDelivery`、测试文件清单、通用 DAG、一次性 Plan 或 Result。

## Selection and execution

Verification Request 冻结 target、selection scope、changed paths/risks 与 declaration identities。Plan 由 Request 和声明或稳定 provider 确定性生成，记录 direct/dependency/full 选择理由、coverage gaps、execution units、request/plan/provider identity。

普通 capability 使用 discovery 选择 affected；缺少可信 affected 入口时显式扩大到 full。未知 owner 失败关闭。复杂 Product 可使用 provider，但 provider 只能投射统一 Plan/Execution facts，不得公开内部 registry DAG、Context cache 或写 Task Result。

正式执行必须使用 matching current Plan；preview 不是 evidence。Execution Record 绑定 Request、Plan、declaration、Candidate、target 与 execution unit，reconciliation 只消费同一 Plan 的 terminal records。

## Maintenance boundary

更新前读取真实测试源码、构建脚本、CI、内部 registry、环境与副作用。保留稳定 capability id，只写已确认事实。测试不存在时保留空声明或 coverage gap，并把测试建设交给 `project-testing`。
