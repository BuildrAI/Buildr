# Tasks: remove-daily-progress

## 后端（services/buildr）

- [x] 删除 `src/modules/task/daily-progress/`（domain、application、persistence、CLI、HTTP）
- [x] `src/modules/task/module.ts`：移除 daily-progress import、`createDailyProgressModule`、`PROJECT_DAILY_PROGRESS_APPLICATION` 及 domain/application 再导出
- [x] `src/bootstrap/runtime.ts`：移除 `createDailyProgressModule` 安装
- [x] `src/bootstrap/cli/registry.ts`：移除 daily-progress contribution、命令槽位与帮助分组
- [x] `src/modules/workbench/module.ts` 与 `workbench/application/workbench-application.ts`：移除 dailyProgress 依赖、`readDailyProgress`、`inspectWorkbenchActivity` 及响应字段
- [x] `src/modules/workbench/interfaces/http/workbench-http-schema.ts` 与 HTTP 路由：移除 `WorkbenchActivityResponse`、`WorkbenchDailyProgressItem`、`dailyProgress` 字段与 `/workbench/activity` 端点
- [x] `src/infrastructure/contracts/public-json.ts`：移除六个 `buildr.project-daily-progress-*/v1` identity
- [x] `src/web/http/http-operation-coverage.ts`：移除 `workspace.daily-progress` 条目
- [x] `src/modules/workspace/application/workspace-operations.ts`：移除 `/.buildr/daily-progress/` gitignore 注入
- [x] 重新生成 `build/generated/workbench-dto.ts` 等派生类型

## 前端（services/buildr-web）

- [x] 删除 `src/features/project-daily-progress/`（api、components、dailyProgressNavigation、css）
- [x] 删除 `src/features/workbench/pages/WorkbenchActivityPage.tsx` 与 `components/WorkbenchDailyProgress.tsx`
- [x] `src/app/`：移除 `activity` 路由、导航项、codex-navigation、navigation.ts、workspace-pages.ts 的 daily 重定向
- [x] `AgentActionDrawer.tsx`、`AgentActionFeedback.tsx`：移除 `daily-progress` 动作
- [x] `src/features/project/`：移除 `ProjectHomeEntries` 的“项目动态”入口与 `ProjectDetailPage` 的组合、副屏、旧链接重定向
- [x] `src/features/workbench/`：移除概览“每日演进”卡片、api 中 `inspectWorkbenchActivity` 与类型引用
- [x] `test/`：删除 `daily-progress-navigation.test.mjs`，更新 `workspace-pages.test.mjs`

## 资源与清单

- [x] 删除 `services/buildr/resources/workspace/skills/buildr/project-daily-progress/`
- [x] `services/buildr/resources/manifest.yml`：移除 skill 条目与文件映射
- [x] `services/buildr/resources/workspace/gitignore`：移除 `/.buildr/daily-progress/` 条目

## 测试与验证登记（services/buildr）

- [x] 删除 `test/unit/project-daily-progress-domain.test.ts`、`test/integration/project-daily-progress-application.test.ts`
- [x] `test/verification/registry.ts`、`ownership.ts`、`planner.ts`、`cli/architecture.ts`、`cli/product-layer-boundaries.ts`：移除 `integration-project-daily-progress` 切片与 daily-progress 架构检查
- [x] `test/verification/verification-inputs.ts`：跟踪源文件缺失时保留 `absent` 输入身份、不尝试读取其正文，并补充删除源文件的回归测试
- [x] `test/context/dispositions.ts`、`test/helpers/workspace-product-suite.ts`、`test/contract/bootstrap-module-architecture.test.ts`、`buildr-web-workspace-feature-architecture.test.ts`、`system/public-json-contracts.test.ts`、`system/buildr-web-http.test.ts`、`integration/workbench-application.test.ts`、`integration/buildr-web-workspace.test.ts`、`browser-smoke/*`、`unit/verification-reuse.test.ts`：更新引用

## 当前认知与文档

- [x] 删除 `knowledge/docs/flows/project-daily-progress.md`；更新 `knowledge/index.yml`、`docs/README.md`、`glossary.md`、`docs/architecture/buildr-data-design.md`、`verification-framework.md`
- [x] 更新 `knowledge/code-map/`（system-services-assets、technical-layers、task-system、README）与 `knowledge/archify/` 相关 JSON/HTML
- [x] `services/buildr/docs/cli-reference.md`、`README.md` 等移除每日演进段落
- [x] CHANGELOG 增加本轮移除说明（保留历史条目）

## 验证

- [x] 全仓库搜索确认活跃引用清零（归档历史除外）
- [x] `services/buildr` 受影响测试与 `services/buildr-web` 测试通过；构建与类型检查通过
- [x] `openspec validate remove-daily-progress --strict` 与 convergence preflight 通过
