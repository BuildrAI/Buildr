# Buildr 技术架构

## 所有权与源码边界

- Product Project root：`projects/product/`，拥有产品治理、OpenSpec、docs、knowledge 与 Service registry。
- Buildr Service root：`projects/product/services/buildr/`，拥有 CLI、Local App、runtime adapters、验证、package 和发布实现。
- 用户 Workspace 中由 Buildr 交付的 Rules/Skills/Components 是安装结果，只能由 Product checkout 的 update/sync 单向物化。

## 运行结构

- CLI 解析 Workspace/Project/Service manifests，执行确定性 source mutation、render、doctor、package 和 Local App lifecycle。
- Runtime adapter 将受管 Rules、Skills、contributions 和 capability binding evidence 投射到 Agent 原生入口；Project 普通知识和 Service repo 保持源资产，不复制进 runtime。
- Local App 只监听 loopback，以 Workspace registry 为全局目录，通过 application/domain 层读取 Project、Service 和 Change；生命周期写操作交给 Agent prompt。

## Capability 与 Component

- `skills/manifest.yml` 注册 capability contracts、providers、consumers 和 workspace default bindings。
- Consumer 依赖 capability identity，不依赖 provider Skill id；required/optional 分别产生 blocked/degraded readiness。
- OpenSpec 1.6.0 作为默认 Component 交付上游 workflow Skills。Buildr 通过 Skill Contributions 在 runtime 组合 contract guard、terminology 和 current knowledge 门禁，不修改上游 Skill source bytes。

## 数据与完整性

Workspace、Project、Service、Rules、Skills、Commands 和 Components 由各自 manifests/registries 维护稳定 identity。Buildr 对路径、symlink、ownership、transaction、integrity 和并发 mutation fail closed；runtime 是可重建投影，不是源资产。

## 验证

Project `verification.yml` 定义或增强验证政策。实现循环使用 minimal feedback，任务组完成后运行 affected，最终冻结 tree 运行 Candidate；evidence 绑定 candidate identity，内容变化后失效。正式 `buildr verification run` 位于可发布 `src/application/verification`，从已登记 Project 解析 policy，按依赖与显式 supersedes 构造 DAG，并发执行兼容能力；checkout 与 npm 安装后 CLI 共用该实现，不依赖 `test/verification`。

Production verification summary 只公开一个 `buildr.verification-evidence-lifecycle/v1` 对象，execute、Task Finish consumer 与 `verification cleanup` 共享 run identity、summary path 和 provider-owned directory 边界。Cleanup 只删除系统临时根下、名称和 summary containment 均匹配的单次 transient run；首次删除后的相同公开调用只在精确 summary 路径及整个 run directory 已不存在时幂等返回 `already-absent`。Caller-managed、symlink、越界、父目录仍存在或不可证明的 legacy summary 保留现场。

验证 scheduler 管理单 run readiness/并行，resource coordinator 管理跨 task 共享容量：`isolated` 保持 task-local，`namespaced` 从 task/environment/run 派生命名空间，`coordinated` 在 Git common-dir 保存带 heartbeat/expiry/token 的 lease，`external` 要求显式授权。结果使用进程外单调时钟记录真实 wall-clock，并以 policy、environment、repository candidates 与 checks 形成 `evidenceIdentity`。Buildr 不创建或调度 Agent/task。

## Task Finish

Task Finish 是产品持有的固定五阶段执行器：`preflight → prepare → verify → deliver → cleanup`。CLI 只公开 `task finish run|inspect`；Application 持有 run store、candidate freeze、产品生成的 resume token 和结果投射，各领域的 OpenSpec convergence、verification、Git、runtime install 与 worktree cleanup 仍由确定性服务执行。正常路径不经过 action registry、Agent/provider completion 或调用方 evidence/recovery 协议。

`preflight` 从 canonical Workspace 读取 Project 登记事实，但从 receipt-bound task environment 读取 Change、knowledge、verification policy 与 Git 候选；它一次聚合廉价只读问题。`prepare` 完成全部候选 mutation 并冻结 identity，`verify` 对冻结候选最多执行一次 required assurance。产品缺陷、语义冲突和验证失败是终态并返回研发流程；只有 target、network、retained install 与 task-owned cleanup 等不改变候选语义的暂态条件可以恢复。客户端直接替换旧执行器，继续使用唯一 canonical run store，不创建版本化目录、兼容 reader 或状态迁移模块。
