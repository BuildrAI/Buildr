# task-retrospective-module-architecture Specification

## Purpose

定义独立Task Retrospective模块的退役边界，以及复盘文档读取归Task Record、分析归Agent与纯Skill的职责划分。

## Requirements

### Requirement: Buildr不得提供独立Task Retrospective模块
Buildr MUST不提供Task Retrospective Domain、Application、Repository、module descriptor、runtime port、内部Driver、HTTP处置adapter或SQLite current writer。Task Record MUST只维护本机复盘文档摘要和人的决定状态，Agent MUST通过纯Skill生成正文。

#### Scenario: 创建Bootstrap runtime
- **WHEN** Buildr组装Task模块与HTTP贡献
- **THEN** module registry MUST不存在`task-retrospective` descriptor、port或writer
- **AND** Task Record、Review、Verification与Parent能力 MUST继续独立可用

#### Scenario: 检查退役路径
- **WHEN** package或架构验证扫描生产源码
- **THEN** 旧Retrospective实现、Driver、内部route和HTTP处置路径 MUST不存在
