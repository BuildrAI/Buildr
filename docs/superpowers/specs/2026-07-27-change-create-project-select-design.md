# 创建变更：所属项目改为下拉选择

日期：2026-07-27  
状态：已批准并实现

## 背景

Buildr 本机 App 的「创建变更」表单（`renderChangeForm`）中，「所属项目」当前为自由文本 `<input>`，容易填错或填入未登记项目代码。同抽屉内的「接入服务」「用 Agent 开始」已通过 `/api/v1/projects` 填充 `<select>`，行为不一致。

## 目标

创建变更时，所属项目只能从已登记项目中下拉选择；无项目时与「接入服务」一致，无法提交。

## 非目标

- 不改继续/审查变更流程（已有 `context.ref` / `context.action`）。
- 不改 `POST /api/v1/prompts/change-create` 请求契约（仍传 `projectCode` + `goal`）。
- 本次不抽取跨表单的共用 `fillProjectSelect` helper（可后续重构）。
- 不新增 OpenSpec 产品语义变更（纯本机 App 交互约束）。

## 方案

在 `projects/product/services/buildr/src/interfaces/local-app/web/features/agent-actions.js` 中：

1. 将 `renderChangeForm` 创建分支改为 `async`，表单中「所属项目」使用必填 `<select id="action-project">`，初始 option 为「正在读取已登记项目…」。
2. 请求 `GET /api/v1/projects`，以 `名称（code）` 填充选项，`value` 为 `project.code`。
3. 若 `context.projectCode` 存在于列表中，则预选该值（例如从变更列表筛选后点「让 Agent 创建变更」）。
4. 若项目列表为空，唯一 option 为「请先创建项目」（`value=""`），配合 `required` 阻止提交。
5. 加载失败时，在已有 `#agent-action-error` 中展示错误信息。
6. 提交逻辑保持不变：`POST /api/v1/prompts/change-create`，body `{ projectCode, goal }`。

## 验收标准

- 有项目时：只能从下拉选择已有项目，不能手输任意字符串。
- 有 `context.projectCode` 且有效时：打开表单即预选该项目。
- 无项目时：下拉显示「请先创建项目」，提交按钮因 `required` 无法成功提交。
- 继续/审查变更抽屉行为与改前一致。

## 验证

- 优先：相关 browser smoke（若已有 agent-action / change 路径）补或跑覆盖断言。
- 最低：手动打开「创建变更」，确认下拉与空态；必要时跑 `npm run test:browser:change` 或等价 focus 测试。

## 风险

低。仅前端控件类型与填充逻辑对齐现有服务表单；API 与 prompt 生成契约不变。
