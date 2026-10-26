## 1. 规则核心与诊断

- [x] 1.1 移除 `rule-manifest-repository` 的写路径与 manifest 读写导出；保留一个只读的存量 Rule 资产观察器，用于 doctor 统计 manifest 登记项、可解析性和 `rules/*.md`。
- [x] 1.2 重写 `diagnoseRules`：保留 `workspace.requiredBlock`，移除 `rules.manifest_missing` 与非空登记必需诊断；对非空 manifest、不可解析 manifest 和 `rules/*.md` 输出不阻断 warning 与迁移指引。
- [x] 1.3 调整 doctor 的 `rules` 输出为退役摘要，确保不暴露可消费的 Rule manifest 状态。
- [x] 1.4 移除 `rules add` / `rules remove` CLI 路由与 agent-assets 应用导出；在 CLI 错误诊断中加入稳定的退役命令提示，指向 `AGENTS.md` 与 `rules render`。
- [x] 1.5 移除 `agent-assets.rules.add/remove` HTTP schema、operation 与 handler；inventory 响应移除 `rules` 字段并停止读取 Rule manifest。
- [x] 1.6 移除 `agent-assets source inspect` 中由 Rule manifest 派生的规则对象与 `readRules` 端口。
- [x] 1.7 code commit guidance/material 不再观察或读取 `rules/manifest.yml`，提交语言继续来自 `AGENTS.md`。

## 2. 初始化、准备与布局

- [x] 2.1 `resources/manifest.yml` 的 `workspaceDirectories` 移除 `rules`；`GENERATED_USER_REGISTRY_RESOURCE_SOURCES` 移除 `rules/manifest.yml`。
- [x] 2.2 `workspace-operations.initializeWorkspace` 不再写 `rules/manifest.yml`，并移除对应 renderer 依赖。
- [x] 2.3 `workspace-preparation` 不再把 `rules/` 或 `rules/manifest.yml` 作为必需目录/文件校验。
- [x] 2.4 替换 `developmentWorkspaceRoot` 中对 `rules/` 目录的探测，改用稳定的产品工作空间路径（如 `projects/product`）。
- [x] 2.5 确认 init 结果不包含 `rules/` 或 `rules/manifest.yml`，且根 `AGENTS.md` 受管区块仍生成。

## 3. Component Rule 成员退役

- [x] 3.1 `component-definition` 解析时忽略空 `members.rules`，对非空值产生明确退役错误；渲染不再输出 `members.rules`。
- [x] 3.2 `components` 移除 `componentMemberKind`、`componentBuiltinForMember`、install/remove/reconcile 中的 Rule 分支与 Rule manifest 读写；兼容空数组成员。
- [x] 3.3 `infrastructure/runtime/skills/contributions` 的 Component 定义解析同步容忍空 `members.rules`、拒绝非空值。
- [x] 3.4 随包 OpenSpec Component 定义移除 `rules: []`，并确认 integrity 与 Component 校验仍通过。
- [x] 3.5 补充 Component 测试：空 `members.rules` 兼容、非空值失败、安装/卸载不再写 Rule manifest。

## 4. 内置 Rules 与 package 验证

- [x] 4.1 `resources/manifest.yml` 移除 `builtins.rules`；`package-assets`、`builtin-lifecycle`、`sync-plan` 移除 Rule 内置同步、卸载、恢复和 mutation path。
- [x] 4.2 `package-maintenance` 不再读取/写入 Rule manifest，不再执行 legacy core Rule 自动删除；保留 `AGENTS.md` 受管区块维护。
- [x] 4.3 package static validation 移除 `builtins.rules`、Rule manifest baseline、Rule 源路径与 legacy Rule 校验；新增“不得重新出现 `builtins.rules` 或 `rules/buildr/*.md`”检查。
- [x] 4.4 package runtime checks 移除 `rules add/remove` CRUD 断言；新增退役命令无写入断言与 `rules render` 仍可用断言。
- [x] 4.5 更新 package-check 的 verifier 依赖注入，移除不再使用的 Rule parser/renderer。

## 5. Buildr Web 与生成契约

- [x] 5.1 移除 Buildr Web `agent-assets-api` 的 `addRule`/`removeRule` 与对应生成 DTO 类型导入。
- [x] 5.2 重新生成 Agent Assets HTTP DTO，确认 Web typecheck 不再引用 Rule add/remove 或 inventory `rules`。
- [x] 5.3 确认 Agent Assets 页面在 inventory 不含 `rules` 时仍可正常读取和渲染。

## 6. 文档、核心规则与 Agent 指引

- [x] 6.1 改写 `resources/workspace/AGENTS.md` 两处引用：规则读取并入 `AGENTS.md` 层级，受管区块说明不再引用 `rules/manifest.yml`。
- [x] 6.2 更新 `resources/runtime/skills/buildr/references/asset-maintenance.md`：删除 Rule manifest / `rules add/remove` 指引，保留 `AGENTS.md` 维护与 `rules render`。
- [x] 6.3 更新 `docs/cli-reference.md`：移除 `rules add/remove`，保留并说明 `rules render` 投射 `AGENTS.md`。
- [x] 6.4 检查其他 active 文档、Skill 和 README 是否仍指导 `rules add/remove` 或 `rules/manifest.yml`，按实际影响更新。

## 7. 存量兼容与诊断测试

- [x] 7.1 将 `inline-workspace-core-rules` 测试改为退役语义：init 不生成 Rule 资产、旧命令失败且不写文件、旧 manifest/规则文件保留、doctor warning 不阻断。
- [x] 7.2 更新 workspace 初始化、doctor、Agent Assets HTTP、Component、package-check 相关测试与 fixture，移除 Rule manifest 期待。
- [x] 7.3 增加非空 `rules/manifest.yml` 与 `rules/*.md` 的 doctor warning 测试，并断言 workspace readiness 不受影响。
- [x] 7.4 更新静态架构、命令表面、模块所有权和 managed-mutation 清单，移除已退役命令与模块入口。

## 8. 当前知识

- [x] 8.1 更新 `knowledge/docs/architecture/buildr-data-design.md`：规则不再由独立清单指向原文，改由 `AGENTS.md` 层级承载。
- [x] 8.2 更新 `knowledge/docs/glossary.md` 的规则适用范围，明确组织、项目、服务的 `AGENTS.md` 层级。
- [x] 8.3 检查 `knowledge/code-map/system-services-assets.md`、`knowledge/docs/overview.md` 和 Archify 图是否仍准确描述 Rule 投射；只在语义受影响时更新。

## 9. 直接验证

- [x] 9.1 运行受影响单元/集成测试与 Buildr Service 静态检查。
- [x] 9.2 运行 `npm run check`（或 Service 当前静态检查入口）与相关 `npm test` 目标。
- [x] 9.3 运行 `buildr package check`，确认退役边界、无 `builtins.rules` 和 rule render 仍通过。
- [x] 9.4 运行 `openspec validate retire-rule-asset-mechanism --strict` 与 `buildr openspec convergence preflight`。
- [x] 9.5 在临时 workspace 实测：init 不生成 `rules/`；`rules add/remove` 返回退役提示且零写入；存量 `rules/manifest.yml` + `rules/*.md` 触发 doctor warning 且 doctor 仍可用；`rules render` 正常投射 `AGENTS.md`。
