# AGENTS.md

智能体（Agent）在 `{{project}}` 项目（Project）中遵守的业务约束与工作边界。

## 项目定位

本文件是项目作用域（Project Scope）规则。开始项目任务时，先遵循 Buildr 根 `AGENTS.md` 中的内联核心规则，再读取本文件；进入具体服务仓（Service Repository）后继续读取其 `AGENTS.md`。

禁止把其他 Project 的规范直接视为本 Project 事实；可以参考其目录组织和写法，但业务事实必须在本 Project `openspec/` 中独立沉淀。

## 资产边界

| 对象 | 位置 | 说明 |
|------|------|------|
| Project rules | `AGENTS.md` | 当前 Project 的 Agent 工作规则 |
| OpenSpec | `openspec/` | Project 事实、能力规范、变更和归档 |
| Capability context | `capabilities.yml` | 引用 workspace Skill，并声明 Project requirements、bindings 与 applicability；不存储 Skill 源 |
| 项目组成（Project Composition） | 工作空间 `projects/manifest.yml` | 项目通过 `serviceIds` 引用服务，可共享引用同一服务 |
| 服务登记（Service Registry） | 工作空间 `services/manifest.yml` | 服务说明实现职责并引用唯一代码库实例，不由项目目录层级决定归属 |
| 代码库登记（Repository Registry） | 工作空间 `repositories/manifest.yml` | 代码库实例及本机路径是定位代码的依据；实际 Git 边界须现场核对 |

Project 经验不使用独立 Practices 资产类型：约束和值守边界写入 Rule，可复用专业动作和操作流程写入 Skill，产品事实、需求和变更写入 OpenSpec，其他说明保留为普通 docs。

## 服务入口

项目（Project）通过已登记组成定位服务（Service），再由服务的代码库实例（Repository Instance）定位实际代码。共享服务不形成唯一父项目，也不自动合并所有引用项目的规则；本次涉及项目、服务及实际代码目录的规则共同适用。目录名和 `services/<service>/` 外观不能证明独立 Git 仓库。
