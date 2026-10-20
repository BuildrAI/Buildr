# Tasks

## 1. 异步克隆执行器

- [x] 新建 `modules/workspace/infrastructure/repository-clone-supervisor.ts`（或 application 层等价位置）：`ensure/status/request`，spawn 异步 `git clone`，内存态 running/failed/ready，重复发起幂等，目录已存在收敛为已准备，失败记录 stderr 尾部。
- [x] 单元/逻辑测试：ensure 幂等、并发互斥、目录已存在跳过、失败诊断、clone 成功建立 `.git`。

## 2. 登记触发自动克隆

- [x] `asset-relationships-application.ts`：`createCatalogRepository` 与 `addService` 的 `raw.repository` 分支在 mutate 成功后收集新 git 实例并 `supervisor.ensure`；supervisor 经 runtime 注入。
- [x] 逻辑测试：新增 git 库触发克隆、workspace/local 来源不触发、内嵌新增触发、mutate 失败不触发。

## 3. 源代码管理接口

- [x] `code-http-contracts`：新增 `code.repositoryClone` POST；`CodeSourceControlRepository` 增 `clone` 字段。
- [x] `source-control-application.ts`：目录缺失实例合并 supervisor 状态为 `clone`。
- [x] `code-http.ts`：路由 `POST /code/repository-clone` → `repositoryCloneRequest`。
- [x] DTO/契约：contracts prepare 生成。

## 4. 前端

- [x] 源代码管理页：缺失实例显示「克隆到本地」；克隆中禁用并显示进行态；失败显示诊断；提交后刷新清单。
- [x] 内嵌新增代码库说明文案微调（登记后自动拉取本地），不新增选项。

## 5. 验证

- [x] `npm run contracts:prepare` + `npm test` + `tsc`.
- [x] buildr-dev-preview 浏览器端到端：新增 git 库→清单克隆中→可读；人为失败（无效 URL）→诊断+重试入口。
