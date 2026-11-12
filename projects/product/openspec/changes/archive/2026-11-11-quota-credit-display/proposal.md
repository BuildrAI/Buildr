## Why

右下角“账号额度”浮窗按账号接口返回顺序展示，来源顺序随登录与刷新变化，难以快速定位某个来源；Qoder 与 Qoder CN 的套餐、资源包窗口只显示剩余百分比，用户看不到还剩多少 credits。模型设置页的“账号与额度”卡片也存在同样缺口。

## What Changes

- 额度浮窗按来源显示名称稳定排序，同一来源内按账号名排序，与“模型”页的账号来源顺序一致。
- Qoder 与 Qoder CN 从 `/usage` 取得的套餐、资源包窗口在观察结果中保留结构化的剩余 credits 与总量。
- 账号额度浮窗与模型设置页的额度窗口在存在 credits 数值时同时显示百分比和剩余 credits；没有数值的来源不伪造总量。
- 智能体服务 HTTP 契约的额度窗口新增可选 `remainingCredits`、`totalCredits` 字段，属于向后兼容的增量字段。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `model-usage-controls`: 额度概览增加来源名称排序；Qoder 额度窗口增加剩余 credits 数量的表达。

## Impact

- `projects/product/services/buildr-agent`：`src/model-access/contracts.ts`、`src/operation-schemas.ts`、`src/model-access/providers/qoder.ts` 及额度单元测试。
- `projects/product/services/buildr`：重新生成 `agent-service-http-dto`，无需修改业务实现。
- `projects/product/services/buildr-web`：`account-quota-view.ts`、`AccountQuotaButton.tsx`、`account-model-view.ts`、`AccountModelManager.tsx` 与相关单元、浏览器检查。
- `projects/product/knowledge/docs/architecture/agent-integration.md`：补充额度概览排序与 credits 展示事实。
