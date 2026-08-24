## 1. Owner inventory and migration seam

- [x] 1.1 盘点 `src/application/domains/package-assets.mjs`、`src/application/workspace-operations.mjs` 的 exports、Bootstrap 注册点、CLI/HTTP/Doctor consumers、测试输入与 product resource 路径，形成可验证 owner map。
- [x] 1.2 在 `workspace/module.mjs`、`agent-assets/module.mjs` 和 Infrastructure product-resources 入口确定窄 requires/provides/Query 边界，确保没有第二套 writer 或隐式 composition root。

## 2. Workspace Control Plane owner 迁移

- [x] 2.1 将 Workspace onboarding、mutation journal/recovery、bootstrap guide 与 declaration-intake 编排迁入 `workspace/application/`，由 `workspace/module.mjs` 注册并保持 `init`、`mutation recover` 和 Doctor 观察行为不变。
- [x] 2.2 提供稳定的 Workspace/Project/Service 只读 Query surface，返回后续 Task 所需 identity、registry 与规范化路径事实，不暴露 Persistence、SQLite、Environment Receipt 或 writer handle。
- [x] 2.3 迁移 Workspace CLI/HTTP/diagnostic consumers 与直接 imports，补充 Query owner/依赖方向 contract tests。

## 3. Agent Assets 与产品资源 owner 迁移

- [x] 3.1 将 Package Assets manifest 解析、registry convergence 与 package maintenance 编排收敛到 `agent-assets/application/package-maintenance/`，复用现有 Agent Assets application/module 入口，不复制 manifest 或 writer authority。
- [x] 3.2 将 manifest 读取、产品资源 path mapping、文件枚举/复制等纯技术机制收敛到 `infrastructure/product-resources/`，并让 Agent Assets 通过窄 capability 使用它们。
- [x] 3.3 运行 `package check/build`、sync、render 与 runtime projection 的 focused tests，证明 manifest、source、projection、receipt 和安全边界行为等价。

## 4. Bootstrap、旧路径与架构台账

- [x] 4.1 更新 `bootstrap/runtime.mjs` 和 CLI registry，使 Bootstrap 只安装 Workspace/Agent Assets module，不再直接注册旧全局 Package Assets/Workspace Operations。
- [x] 4.2 迁移完成后删除 `src/application/domains/package-assets.mjs` 与 `src/application/workspace-operations.mjs`，并通过静态检查确认没有旧路径 import、转发 facade、重复 writer 或新增循环依赖。
- [x] 4.3 更新 `docs/architecture/service-architecture.md`、verification registry、managed-mutations/integrity inputs 与 architecture verification，记录本 Child 的 owner、迁移状态和后续 Child 边界。

## 5. 行为验证与 Change 收敛

- [x] 5.1 运行受影响的 unit/component/contract/integration tests，以及 package/workspace/Doctor/init/mutation recovery 验证；修复发现的行为回归并记录结果。
- [x] 5.2 更新 `.buildr/knowledge-impact.yml` 与 brief 的真实 current knowledge 影响，确认术语、架构台账和权威 specs 一致。
- [x] 5.3 在所有实现任务完成后运行 `openspec validate reorganize-buildr-workspace-control-plane --strict` 与 convergence preflight；通过后将 Change 标记为可归档，并保持后续 Task Execution/Verification、Contract/Bootstrap Child 的剩余范围明确。
