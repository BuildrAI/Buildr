# 实施清单

- [x] 1. 守卫按文件身份判定共享范围：`src/modules/workspace/persistence/workspace-registry-repository.ts` 新增可选 `sharedProfileRegistryFile`（默认用去除 `BUILDR_APP_DATA_DIR` 的 `resolveWebProfile` 计算 Profile 默认登记文件），`isSharedRegistryScope()` 改为 `sameFilesystemPath(本实例登记文件, 共享登记文件)`。
- [x] 2. 更新 `test/integration/workspace-registry-scope.test.ts`：共享/隔离 profile 改用注入 `sharedProfileRegistryFile` 构造，移除强制 `overridden=false` hack；新增"覆盖变量指向共享数据根仍拒绝临时目录"回归；保留共享拒绝临时目录、拒绝 .worktrees、隔离允许临时位置场景。
- [x] 3. 测试辅助工具强制隔离：`test/helpers/workspace-product-suite.ts` 的 `runBuildr`/`runBuildrAsync` 去掉 `|| process.env.BUILDR_APP_DATA_DIR` 条件，未显式传 `options.env` 时一律造隔离数据根。
- [x] 4. 运行定向集成测试与生产/测试类型检查：`test:related --base dev` 正式入口 selected=28 executed=28 failed=0 gaps=0；tsconfig.json 与 tsconfig.tests.json 类型检查 rc=0。
- [x] 5. 当前认知影响评估：无外部认知影响（`.buildr/knowledge-impact.yml` 属其他任务；readiness 文档"临时根"指发布临时目录清理，无关）；契约变化已由本变更规范 delta 表达。
- [x] 6. `openspec validate shared-registry-scope-identity --strict` 通过；`buildr openspec convergence preflight` 通过（无 blockers，本变更 status current）。
