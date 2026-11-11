## 1. 额度契约与 Qoder 观察

- [x] 1.1 在 `ModelQuotaObservation.windows` 与 HTTP `quota.windows` schema 增加可选 `remainingCredits`、`totalCredits`，验证智能体服务类型检查通过
- [x] 1.2 Qoder 观察在套餐、资源包与组织资源包窗口填入真实剩余和总量，不改变百分比、耗尽判定与摘要；验证 `model-providers` 中 Qoder 套餐耗尽、组织资源包和读取失败用例通过

## 2. Buildr Web 额度展示

- [x] 2.1 提取来源显示名称与稳定排序 helper，额度概览按来源名称、账号名排序；验证 `account-quota-view` 单元测试覆盖多来源顺序与空值不伪造数量
- [x] 2.2 额度浮窗在窗口存在 credits 数值时以百分比下方小字显示“剩余 / 总量 credits”，保持百分比、重置与观察事实；验证浮窗渲染与现有读取失败、空状态用例不回归
- [x] 2.3 模型设置页额度窗口把 credits 数量放入窗口脚注，缺少数值时不显示；验证 `account-model-view` 单元测试覆盖数量传递与缺省
- [x] 2.4 重新生成 `agent-service-http-dto`，验证 Buildr Web 类型检查与静态检查通过

## 3. 真实界面与当前知识

- [x] 3.1 在任务工作树的隔离预览中用受控账号数据核对额度浮窗按来源排序、Qoder 与 Qoder CN 的 credits 第二行及模型设置页额度卡片；验证页面无脚本错误并保留截图
- [x] 3.2 用预览中的真实 Qoder CN 额度核对“剩余 / 总量 credits”从智能体观察到浮窗、设置页的完整链路；验证两处均显示实际数量
- [x] 3.3 更新 `knowledge/docs/architecture/agent-integration.md` 中额度概览排序与 credits 展示事实，验证文档与最终实现一致

## 已知验证缺口

- 正式对话浏览器检查 `e2e-browser:agent-conversations` 在本机 1280×420 视口欢迎区断言失败，干净主检出复现同一失败，确认为既有环境/基线问题。受影响的额度界面已由任务预览定向验收覆盖；验证报告保留该失败与缺口，不声称完整 E2E 通过。
