# AGENTS.md

Agent 在 `{{project}}` Project 中的最小运行规则。

## 项目定位

本文件是 Project scope 规则。开始项目任务时，先遵循 Buildr root `AGENTS.md` 和 Buildr Core，再读取本文件；进入具体 Service repo 后继续读取该服务仓 `AGENTS.md`。

禁止把其他 Project 的规范直接视为本 Project 事实；可以参考其目录组织和写法，但业务事实必须在本 Project `openspec/` 中独立沉淀。

## 资产边界

| 对象 | 位置 | 说明 |
|------|------|------|
| Project rules | `AGENTS.md` | 当前 Project 的 Agent 工作规则 |
| OpenSpec | `openspec/` | Project 事实、能力规范、变更和归档 |
| Capability context | `capabilities.yml` | 引用 workspace Skill，并声明 Project requirements、bindings 与 applicability；不存储 Skill 源 |
| Service registry | `services/manifest.yml` | 当前项目 service repo registry |
| Service repos | `services/<service>/` | 独立 Git repo，业务代码由自身 Git 管理 |

Project 经验不使用独立 Practices 资产类型：约束和值守边界写入 Rule，可复用专业动作和操作流程写入 Skill，产品事实、需求和变更写入 OpenSpec，其他说明保留为普通 docs。

## 服务入口

Project 服务通过 `services/manifest.yml` 维护 Service registry，默认 repo 目录为 `services/<service>/`。进入具体 Service repo 后，继续读取该服务仓 `AGENTS.md`。
