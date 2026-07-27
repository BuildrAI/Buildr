# Project Verification Declaration v1

Project 可以在 `projects/<project>/verification.yml` 声明团队确认的测试能力。该文件可选；不存在时 `task-verification` 使用 legacy policy discovery，不产生缺失诊断。

## 顶层结构

```yaml
schemaVersion: buildr.project-verification/v1
mode: augment
resources: []
capabilities: []
```

- `mode: augment`：声明增强现有 AGENTS、POM、脚本和文档政策；无法确认完整 Candidate 时如实报告。
- `mode: authoritative`：声明是 Project 测试政策 authority；必须至少存在一个 `stable`、Candidate `required` 能力。

## Resource 字段

`resources` 是可选的 Project 资源目录。每个条目必须包含稳定 `id`、`title`、`strategy`、`cleanup` 和 `authorization`：

- `isolated`：资源已按 task/run 独立，不进入共享队列；cleanup 使用 `provider-owned | task-owned`。
- `namespaced`：执行器通过 `namespaceEnv` 注入 task/run 唯一命名空间；cleanup 使用 `provider-owned | task-owned`。
- `coordinated`：使用正整数 `capacity` 在同一 canonical Workspace 的多个验证进程之间排队；cleanup 为 `provider-owned`。
- `external`：外部共享状态，只允许 `authorization: explicit` 与 `cleanup: external`；Buildr 不创建或清理。

Capability 可用 `resourceClaims` 引用已登记资源。未知引用、重复 claim 或策略字段不完整会使声明无效；未声明 `resources/resourceClaims` 的旧文件保持兼容。

## Capability 字段

每项能力必须声明：

- `id`：Project 内稳定、唯一的小写 id，可使用 `.`, `_`, `-` 分段。
- `title`：面向团队的名称。
- `command.argv`：非空 argv 数组，不使用 shell 插值字符串。
- `command.cwd`：相对 Project 资产或 workspace 可解析边界的安全路径。
- `maturity`：`discovered | trial | stable`。
- `stages`：`minimal | affected | candidate` 的非空集合。
- `enforcement`：每个 stage 对应 `advisory | required`；只有 stable 能力可以 required。
- `applicability.paths`：该能力适用的相对路径或 glob；可选 `risks`。
- `coverage.kind` 与 `coverage.owns`：测试类型和团队确认的覆盖事实。
- `environment.requires` 与 `environment.services`：工具和运行服务依赖，不保存凭证。
- `effects.level`：`none | local-temporary | local-service | shared | persistent | unknown`。
- `effects.writes` 与 `effects.externalSystems`：可能写入和外部系统影响。
- `authorization`：`implicit | explicit`。只有 none/local-temporary 且不访问外部系统时允许 implicit。
- `resourceClaims`：可选的稳定 resource id 集合；provider 在命令启动前解析隔离、namespace、容量或外部授权。
- `dependsOn`：真实前置能力 id；不得形成循环。
- `supersedes`：团队明确确认可以被本能力覆盖的能力 id；Agent 不自行推断。
- `sources`：扫描或团队确认的事实来源，例如 POM、CI 或项目文档路径。

实现侧registry可以为已登记owner附加preflight，但它不是Project capability的新maturity或enforcement层级。preflight必须声明candidate path inputs、直接executor、artifact dependencies、`effects: none`和budget；不能从技术栈猜测或自动扩张到未声明路径，也不能替代affected/Candidate capability。

## 演进规则

- `discovered`：只作为候选，不自动执行，不得 required。
- `trial`：只允许 advisory；Agent 可在环境和授权允许时积累真实任务证据。
- `stable`：命令、覆盖、环境和副作用边界已确认；团队可以进一步确认 required。

Agent 可以自动发现和补充 discovered/trial 草稿，但不能自动提升为 stable 或 required，也不能把试运行成功等同于覆盖完整。
