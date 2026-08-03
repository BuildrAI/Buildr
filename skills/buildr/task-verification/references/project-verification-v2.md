# Project Verification Declaration v2

`projects/<project>/verification.yml` 声明该 Project 已经存在且团队确认可调用的验证能力。文件可缺省；缺省只意味着 Task Verification 应记录 coverage gap，不会触发测试开发。

## 顶层结构

```yaml
schemaVersion: buildr.project-verification/v2
resources: []
capabilities: []
```

声明是 closed schema。v1 的 `mode`、`maturity`、`stages`、`enforcement`、`coverage`、`sources`、`dependsOn` 和 `supersedes` 已删除，不保留兼容 reader。

## Capability

每项 capability 必须包含：

- `id`：Project 内稳定 identity；
- 可选 `title`；
- `scope.project` 与明确的 `scope.services`；空 Service 列表表示 Project-wide；
- `invocation.kind: command|agent`。command 使用 argv 和 Project-relative cwd；agent 使用非空 bounded instructions；
- `applicability.paths` 和可选自然语言 `conditions`；
- 非空 `proves`，只写该能力实际能够证明的事实；
- `requiredForDelivery: true|false`；
- 可选 `environment.requires`、`effects` 与 `resourceClaims`。

只有已经存在的命令、脚本、CI wrapper 或有界 Agent 操作可以进入声明。Buildr 不根据技术栈推断能力，也不在初始化声明时创建或执行新测试。

## Environment、effects 与 resource

`effects` 可声明 `writes`、`externalSystems` 和 `authorization: implicit|explicit`。存在 external system 时必须显式授权；command runner 只在调用方精确传入 `--authorize-capability <id>` 后执行 explicit effects。

只有真实能力需要跨 Task 容量或外部共享状态时才声明 resource：

- `coordinated`：正整数 `capacity`，可 implicit 或 explicit；
- `external`：无 capacity，必须 explicit。

explicit resource 只有在调用方精确传入 `--authorize-resource <id>` 后才能获取或使用。

未被任何 capability claim 的 resource、未知 claim 或多余字段会使声明无效。普通本地临时目录不需要资源平台。

## 更新边界

初始化或更新声明前，先读取真实 Project/Service scope、package/POM scripts、CI 和项目文档。保留稳定 capability id；只有确认事实才写入。没有能力时保留空 capabilities 或缺省文件，并在具体 Task Result 中记录 coverage gap，不能用声明更新代替测试建设任务。
