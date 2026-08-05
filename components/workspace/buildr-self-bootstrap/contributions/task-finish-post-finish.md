### Buildr 自举 Workspace 收敛

在以下两个时点调用`buildr-self-bootstrap-sync`，且只消费同一run的冻结Task Contribution paths和已有Finish evidence：

- Formal Finish仅以`retained-doctor-failed`阻塞、阻塞ready的Doctor findings全部为`components.update_available`，且package inputs证明更新来自当前Task Contribution时，执行prepare：retained sync与精确本地commit，但不得push；然后恢复同一个Formal Finish run。
- 同一个Formal Finish成功后、最终报告完整收尾前，执行publish：push已准备commit、远端ref回读与最终Doctor。没有prepare且未命中固定package inputs时记录`not-applicable`。

条件不唯一、证据不闭合或任一步失败时停止，不得把其他Doctor问题伪装为自举恢复。Formal Finish尚未成功时不得报告主任务已交付；Formal Finish成功但publish失败时明确报告“主任务已交付、自举Workspace收敛未完成”，不得改写Formal Result。
