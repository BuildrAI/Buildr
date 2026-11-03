## Context

列表通过 conversation-history-groups 保存偏好；浮窗只按条目首次出现分组。两处组内使用相同活动优先与用户输入规则。

## Goals / Non-Goals

共享现有排序及订阅；不复制偏好键、不改状态和筛选，也不引入全局状态库。

## Decisions

复用 historyGroupOrder 排序活动组；在偏好模块提供同页通知与 storage 事件订阅，由轻量 Hook 让两入口读取同一事实。与仅在打开时读取相比，订阅也覆盖已挂载浮窗及跨页签更新。写入失败仍向同页广播本次顺序，保留现有保存失败提示。

## Risks / Trade-offs

- 存储不可用 → 同页内存同步，刷新可能恢复，列表继续提示。
- 跨配置干扰 → storage 订阅只响应当前配置键，卸载移除订阅。

## Migration Plan

沿用原存储键与格式，无数据迁移；回退代码不影响已存偏好。
