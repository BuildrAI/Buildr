---
name: archify
description: 使用 Archify 创建或修改架构、流程、时序、数据流与状态图，或将 Mermaid 转为可交互的独立 HTML 图示时使用。
---

# Archify

绘图前读取随附的 [Archify 上游说明](assets/archify/SKILL.md)，按其方法生成、验证并交付图示。该完整发行包位于本技能（Skill）目录下的 `assets/archify/`；上游说明中的 `bin/`、`scripts/`、`references/` 等相对路径均从该目录解析，命令也在该目录执行。图示输入和输出使用目标项目的绝对路径。

上游内容由 Buildr 的 `archify` 可选组件（Component）整体管理。更新受管版本时使用 Buildr 的组件（Component）更新流程；保留项目中的图示源文件和生成结果。
