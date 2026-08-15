## Why

最新发布候选版暴露出三类验证低效：失效测试 glob 可以以零测试“假绿色”通过，release Task 会并行重复执行同一批 registry step，而 Windows Workspace shard 因资源容量为一形成明显关键路径。现在需要在保持既有跨平台、Host Node、Candidate artifact 与发布证明边界不缩减的前提下，提高验证完整性并缩短 Candidate 墙钟时间。

## What Changes

- 让 registry 的 `node-test` 与测试 glob 在没有解析到任何测试文件时 fail closed，并为失效的 `integration-candidate-recovery` owner 恢复或收敛真实生命周期证据。
- 让普通正式交付只保留一个 required `product.delivery`；release artifact set 保持可独立选择，但不再与 delivery plan 自动重复执行。
- 区分仅版本元数据变化与依赖图、验证拓扑变化：前者按 affected owner 选择，后者继续触发 full-scope。
- 将 Candidate preflight 与单一 artifact 构建合并为一个 bootstrap job；只有真实消费者下载 artifact。
- 将 Windows Workspace/Task 重型 owner 拆成两个负载更均衡、彼此隔离的 shard，并保留每个 step 的稳定 identity、primary owner 与资源容量约束。
- 将 aggregate gate 收敛为不安装项目依赖的轻量纯 Node 聚合，同时继续校验 source SHA、registry、artifact、primary coverage 与完整结果集。
- 保留 macOS/Windows release smoke、Launcher、最低/当前 Host Node tuple 与 Publish 控制面，不通过删除证明范围换取耗时下降。
- 不包含对外 API 或数据格式的破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 增加零测试 fail-closed、正式能力主 owner 去重、版本元数据 affected 选择，以及 Candidate bootstrap、Windows shard 和轻量 aggregate gate 的编排要求。

## Impact

- Product verification registry、planner、executor、Candidate evidence/aggregate contract 与相关测试。
- `.github/workflows/verify.yml` 的 job DAG、artifact dependency 和 runner setup。
- `projects/product/verification.yml` 的 release capability required 边界。
- Product verification quality canonical spec、Buildr Service current knowledge 与发布/验证说明。
- 不新增第三方依赖，不改变 npm 发布、GitHub Environment 审批或 branch protection 的稳定 `Candidate gate` 名称。
