# Project Verification Declaration v4

`projects/<project>/verification.yml` 是 Project 测试地图，不是测试文件清单、执行计划或运行结果；不列举每个测试文件。

顶层仅包含 `schemaVersion: buildr.project-verification/v4` 和 `testing`。每项 testing 包含稳定 `id`、`title`、Project/Service `scope`、`purpose`、相关 `sourcePaths`、用于发现具体测试的 `testRoots`、完整 `full` 入口、可选 `location`、`selection` 指导和 `requirements`。

## 路径根与证明范围

`scope.project`和`scope.services`声明这个测试族证明哪些项目／服务的事实；它们不自动决定执行目录。每个测试族只有一个路径根：

| `location` | `sourcePaths`、`testRoots`、`full.cwd`的相对根 |
|---|---|
| 省略或`{kind: project}` | 当前登记的项目根；省略项不会被规范化强制补写 |
| `{kind: service, service: api}` | 当前登记的`api`服务代码根；`api`必须是该项目已登记且包含在本族`scope.services`中的服务代码（Service Code） |

服务代码与登记中的`code`一致，不是UUID。服务根可以位于项目目录之外，按登记的真实来源解析；地图不写本机绝对路径或`../`来定位它。所有路径使用安全相对路径，不允许绝对路径、父目录穿越或反斜杠穿越。命令工作目录还须在真实解析后留在所绑定根内。

多个服务分别拥有入口时分成各自测试族。跨服务测试若已有项目拥有的聚合入口，可以使用项目根并在`scope.services`说明覆盖；不要把多个仓库路径塞进单一服务根。没有真实聚合入口时分别执行并汇总覆盖，不虚构通用命令。

例如，已登记在外部代码库且拥有`mvnw`的`api`服务可声明：

```yaml
- id: api-unit
  title: API 单元测试
  scope: {project: example, services: [api]}
  location: {kind: service, service: api}
  purpose: 验证服务的纯逻辑
  sourcePaths: [src/main/**]
  testRoots: [src/test/**]
  full: {kind: command, argv: [./mvnw, test], cwd: .}
  requirements: [jdk]
```

示例只有在真实`mvnw test`完整覆盖上述测试范围时才成立；具体测试分类和工具由项目事实决定。使用`location`前需要支持该字段的Buildr版本；没有新字段的既有v4地图保持兼容，不需要自动迁移。

## 当前执行位置

`project verification inspect|validate|update`在结构有效时返回只读`locations`。每项有`testing`、`kind`、适用时的`service`、本机绝对`root`、命令绝对`cwd`、`ready|unavailable`和`diagnostics`。这些位置是当前观察，不写入地图；`kind: agent`保留根而`cwd`为null。

根或命令目录缺失、不是目录、不可访问，或命令目录通过符号链接越出根时，仅该族位置为`unavailable`。地图结构仍可有效并受控维护，其他族继续可用；记录真实检查也不因此失效。执行前重新读取当前绑定、位置及适用规则，局部不可用时说明缺口。`ready`只说明路径可解析，不代表环境、授权、命令语义、测试覆盖或执行结果已经成立。

## 完整入口与选择

`full.kind: command`使用无shell `argv`和相对路径根的安全`cwd`；在当前解析的命令目录原样调用参数和项目拥有的wrapper。`agent`使用非空instructions指导真实执行。完整入口必须覆盖本族声明的测试范围；仅运行集成测试的命令不能同时把系统测试列为完整覆盖，可以按实际入口拆分测试族。

具体测试类、文件或请求由智能体在当前任务中从真实项目选择，不写入长期声明。`selection`记录项目已有的选择方法或提示，选择结果仍须对照真实改动检查覆盖；发现路径漏选时交给`project-testing`补齐映射并验证。

声明候选由智能体读取测试代码、构建脚本、CI和说明后形成；Application只执行inspect、validate、expected-identity update。测试体系不存在时报告建设缺口，不生成测试。
