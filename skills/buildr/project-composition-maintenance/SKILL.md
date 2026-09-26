---
name: project-composition-maintenance
description: 梳理或维护项目由哪些服务和代码库组成，或日常开发新增、替换、停用参与项目的服务时使用；更新现有组成登记，不表达服务之间的依赖。
---

# 项目服务组成梳理与维护

让项目（Project）的登记准确表达哪些服务（Service）共同承担业务目标，并沿已有引用找到代码库实例（Repository Instance）。已有组成图读取同一事实，不另存一份图数据。

## 判断本次组成变化

先明确目标项目（Project）与实际工作空间（Workspace），读取现有登记及相关业务说明。首次梳理从业务目标、已确认设计、代码和配置核对参与的服务（Service）；日常开发只检查本次新增、替换或停用的部分，修改结束后按最终事实复核。

- 以承担的业务职责判断是否加入，不以目录位置、代码扫描结果或某次临时工具使用直接决定组成。已确认采用但尚未编码的组成可以保留；尚在讨论的选项只说明，不登记成已确定事实。
- 优先复用已有服务（Service）身份。基础项目（Project）可以集中组织公共能力，业务只关联实际需要的部分；不复制实现，不要求关联全部公共能力。
- 移除前核对当前业务其他功能是否仍需要它。未扫描到、目录暂不可用或停止一处调用不足以证明整体停用；不确定就保留并说明具体疑问。

用户要求梳理并维护时直接执行；已授权开发中由本次实现引起的必要组成校准一并完成，不逐条重复询问。仅查看或检查时只读；范围外业务及未明确的采用取舍另行确认，不将本次授权扩大为长期全局维护。

## 保存本地组成

独立运行版（Standalone）的事实在三份本地清单（Manifest）：

| 文件 | 读取或维护内容 |
|---|---|
| `projects/manifest.yml` | 指定项目（Project）的 `serviceIds` |
| `services/manifest.yml` | 全局服务（Service）身份、`repositoryId` 与 `modulePath` |
| `repositories/manifest.yml` | 代码库实例（Repository Instance）的身份与来源 |

使用已有本地资产命令保存这些文件，复用版本校验与事务；无需启动网页或服务器。下列 `buildr` 使用当前环境已确认的产品入口：

```bash
buildr assets inspect --target <workspace> --json
buildr assets associate <project-id> --target <workspace> --input <json-file> --json
```

从 `inspect` 返回值核对项目（Project）、服务（Service）身份及 `revision`。在临时 JSON 文件中填写：

```json
{
  "revision": "<本次观察到的 revision>",
  "serviceIds": ["<该项目保存后完整的服务身份集合>"]
}
```

`associate` 替换指定项目（Project）的完整关联集合：在当前 `serviceIds` 上应用本次有依据的增减，保留其余关联，不能只提交新增项或用扫描结果覆盖整份列表。相同组成不写入。版本冲突时重新读取、判断并合并本次增量，不只替换 `revision` 后重放旧集合。

确需新增服务（Service）或代码库实例（Repository Instance）时，先检查已有登记和真实目录，按已有 `buildr assets service-candidates|repository-candidates`、`create service|repository` 动作及当前帮助完成登记，再使用返回的身份和最新版本关联。仅维护组成不搬迁目录、不切换分支、不创建远端代码库（Repository）。遇到 `migrationRequired` 时按已有显式迁移方式处理，保留原身份，不靠重建清单（Manifest）绕过迁移。

解除组成仅移除当前项目（Project）的引用，不调用全局删除动作；其他使用方、服务（Service）、代码库实例（Repository Instance）与代码保留。

## 核对与交付

核对保存返回的关联集合及引用对象，确认增减符合本次判断、原有无关关联仍在。需要查看组成图时打开或刷新现有页面，由它读取同一清单（Manifest）；未实际查看页面就不声称已完成页面验证。

简要说明新增、移除或无需变更的组成、业务理由和仍未确定的项。只解释本次范围，不要求额外报告文件。已有说明文档确实失准时按授权交给 `current-knowledge-maintenance` 校准；它不代替本技能（Skill）写组成登记。

本技能（Skill）在梳理和开发时执行，不持续监听其他入口的修改，不表达服务（Service）间调用或依赖。云端版（Cloud）的保存方式待实际入口可用后再调整。
