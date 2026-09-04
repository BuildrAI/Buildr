# Archify 技术图

这里保存 Buildr Product 的当前态可视化投影（visual projection）。技术图服务于人和智能体理解系统，不替代事实源，也不承担 OpenSpec 规范或变更台账职责。

[返回文字架构入口](../architecture/index.md)

## 当前入口

- [Buildr 系统全景图源码](system/buildr-system-overview.json)：Archify 的结构化图表源码，依据当前 Product 代码、目录结构、OpenSpec 和已登记关系编写。
- [Buildr 系统全景图](system/buildr-system-overview.html)：由源码生成的可浏览 HTML 图表。

JSON 是可维护源，HTML 是可重建投影。两者应保持同名、同目录，并在源码或结构发生影响图表语义的变化时一并更新；普通代码改动不自动要求重画图表。

## 依据与边界

技术图的依据是当前代码及其目录/模块登记、`openspec/specs/` 的规范性行为和 `knowledge/` 中已经整理的当前态模型。图表中的证据路径用于帮助回看依据，但不把图表变成第二事实源。

`knowledge/` 是当前态模型；`docs/` 面向人的解释、维护说明、设计理由和未来思考；`openspec/` 继续承载规范、Change 和历史归档。图表治理、自动漂移检测和按授权触发的维护流程暂不在本目录实现，待系统全景图确认后另行设计。

## 预留维度

以下目录作为后续按需扩展的维护位置，当前不要求填充图表：

- `product/`：产品视角
- `application/`：应用与能力视角
- `data/`：数据与流转视角
- `technology/`：技术与部署视角
- `flows/`：流程、时序和生命周期视角

图表旁的 `*.visual-check.json` 与 `*.visual-check/` 是生成和视觉检查证据，不是新的知识事实源。
