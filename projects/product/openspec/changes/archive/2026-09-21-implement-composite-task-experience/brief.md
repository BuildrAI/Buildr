用户已确认第四版界面原型及实施授权。以现有通用组件保持一致性，隐藏任务新增，简化关联、列表和验收。原型仅是设计输入，不是正式验证。

当前知识影响核对：knowledge/docs/flows/task-parent-coordination.md 与 knowledge/docs/architecture/task-system.md 需要补充新的显式组合结束入口及简化页面；knowledge/code-map/task-system.md 可补充新组件与接口入口。现有文档对原 complete 动作的约束仍成立，但不足以说明新增入口。本轮未扩大到知识文章与技术图改写，保留此同步建议。

2026-09-21 验收修订：用户明确要求列表标题下显示与详情相同的目标，按宽度省略并在悬停时预览全文；这覆盖此前进展/结果摘要方案。所有内容记录时间放在标题下、正文前。预览倾向直接连接所选真实开发/测试数据，保留环境自身权限；本次连接 Buildr 主工作空间，读取真实任务验证显示，不对真实任务执行完成/放弃测试。

真实数据预览已由现有 web preview start 独立入口启动：composite-real-data，代码 productCheckout 为本任务工作树，target 为 ~/Buildr。现有自举 writer provenance 保护拒绝候选写入同仓 retained 工作空间（最近访问写入也被拒绝）；此次未修改或绕过该保护。其他仓库的开发/测试工作空间不命中此同仓保护。通用 profile/环境选择能力不是本轮新增实现。

列表定位与长目标修订：副屏当前任务对应的已加载列表条目高亮并滚动定位，保留筛选条件；详情增加整体滚动且阅读区保持最小可用高度。子任务使用与主列表相同的 Ant Design Table 及 task-compact-table 样式，支持悬停、键盘与整行打开，解除关联不触发行打开。
