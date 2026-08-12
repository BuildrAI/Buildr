## MODIFIED Requirements

### Requirement: publication scope 必须来自真实 writer 的 exact owned paths
Task Metadata Publication MUST只组合当前 writer contract 对同一 Task ID 声明的 portable exact owned paths，MUST NOT通过目录扫描、glob、`git add -A`、extension 或 exclusion list 推断 ownership。Task Record 的 Workspace-local structured declaration MUST贡献空 path 集合，且 MUST NOT阻塞其他 portable writer。

#### Scenario: 全部 portable records 存在
- **WHEN** `development.yml`、`verification.yml`、`reviews/planning.yml` 和 `reviews/completion.yml` 都由对应 writer 安全读取且存在
- **THEN** publication scope MUST精确包含这四个路径
- **AND** MUST为每个路径保留 owner capability identity，且不得加入 Task Record 数据库或旧 `task.yml`

#### Scenario: 部分可选 records 缺失
- **WHEN** 一个或多个 portable records 不存在
- **THEN** publication MUST只纳入实际存在的 declared paths
- **AND** MUST NOT创建占位文件、空目录、Task Record export 或默认 record

#### Scenario: 全部 declared paths 缺失且未被跟踪
- **WHEN** 当前 Task ID 下没有任何 portable declared path 存在，且 Git 当前 tree 也未跟踪这些 exact paths
- **THEN** publication MUST返回 `not-applicable` 且 Git effects 为空
- **AND** MUST保持 Task 目录、SQLite database 和 repository 不变

#### Scenario: 已跟踪的 declared path 当前缺失
- **WHEN** Git 当前 tree 跟踪一个 portable declared exact path 但该 path 在 live Workspace 中缺失
- **THEN** publication MUST把该 exact path 作为精确删除纳入 operation scope
- **AND** MUST NOT把旧 `task.yml`、数据库或同目录其他缺失/未声明内容推断为删除

#### Scenario: 禁止内容位于同一 Task 目录
- **WHEN** `.buildr/tasks/<task-id>/` 或 `.buildr/local/` 存在 `environment.json`、Task Record database、Finish、asset-review、runtime、Candidate、交付源码或其他 owner metadata
- **THEN** 这些内容 MUST NOT进入 publication scope、snapshot、commit 或 push authorization

#### Scenario: 其他 Task records 存在
- **WHEN** canonical Workspace 同时包含其他 Task 的 portable records 或 SQLite rows
- **THEN** publication MUST只处理调用方明确提供的 Task ID 及其 portable writer paths
- **AND** MUST NOT扫描、导出、暂存或提交其他 Task 的数据
