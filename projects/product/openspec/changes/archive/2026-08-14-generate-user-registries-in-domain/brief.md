# 由领域功能生成用户 Registry

Buildr 将用户 Workspace 的持久化配置从产品发布资源中移除，改由初始化、Project 创建和同步功能通过 canonical Domain writer 生成。

## 背景与问题

当前 npm 包把 `package/targets/workspace/` 下的用户态配置源一并发布。部分模板已被运行时代码显式跳过，其他空 registry 仍依赖复制；这使开发基线、产品声明和用户持久化状态之间存在重复 authority，并导致隐藏文件在 release artifact 传输中造成失败。

## 目标与非目标

- 发布包只携带产品定义、Builtin 和实际内容资产。
- Workspace、Project、Service 及 Workspace/Project 级空配置由功能生成。
- 已有用户配置不被空默认值覆盖。
- 不改变公开配置路径、schema、Builtin 生命周期或用户迁移方式。

## 受影响用户或角色

- 使用 `buildr init` 创建 Workspace 的用户。
- 通过 `project create` 创建 Project，或通过 `sync/update` 升级 Workspace 的用户。
- 准备和发布 npm candidate 的 Buildr 维护者。

## 核心流程

初始化先由 Domain writer 建立 schema-valid 的用户配置，再从 `package/manifest.yml` 和 Component definition 收敛产品 Builtin。Project 创建和同步以相同原则补齐缺失配置；发布验证同时拒绝 source tree mapping 和最终 tarball 中的用户态配置源。

## 关键变化

- 删除九类用户态配置的随包物理源。
- 用 Workspace、Project、Service、Rules、Skills、Commands、Components writer 生成默认配置。
- 保留 Rule/Skill 正文、Command collection、Component definition、Agent metadata 和专业模板等产品资产。
- 增加 package static validation 与 tarball inventory 回归门禁。

## 影响、风险与兼容性

新 Workspace 的最终文件路径和 schema 保持不变。已有 Workspace 只在目标配置缺失时由显式同步/更新补齐，现有有效用户内容不覆盖。主要风险是初始化顺序或禁止路径误伤产品 YAML，分别通过先生成空 registry、精确路径集合和 checkout/tarball 对等测试控制。

## 验收摘要

- npm tarball 不包含用户态配置源。
- `init`、`project create`、`sync/update` 仍生成完整 canonical 配置。
- Builtin/Component 安装状态与当前行为一致。
- 已有用户内容保持不变，package/release affected 验证通过。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
