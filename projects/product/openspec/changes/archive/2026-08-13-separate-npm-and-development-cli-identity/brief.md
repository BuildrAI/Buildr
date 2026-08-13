# npm 默认 CLI 与开发入口隔离

## 一句话摘要

机器默认 `buildr` 只代表 npm 安装版，Buildr 自举 Workspace 改为显式使用 retained checkout 的 `projects/product/buildr`，开发安装只维护 `Buildr Web Dev`。

## 背景与问题

当前 self-bootstrap 会把 development CLI 安装到机器默认 PATH，并要求最终 Doctor 通过该入口执行。这让一次 Buildr 开发准备覆盖团队和普通 Workspace 应使用的 npm 发布身份，也会因 shell PATH 顺序不同命中错误 checkout。

## 目标与非目标

目标是隔离 npm 与 development CLI 所有权：默认命令属于 npm，Buildr checkout 的开发命令属于显式 Project bridge；self-bootstrap 保留单一 runner，但不再修改或读取默认 PATH；`npm run install:development` 只维护 `Buildr Web Dev`。本 Change 不发布新版本、不迁移本机命令，也不同步外部 Workspace。

## 受影响用户或角色

- 使用 npm 发布版管理普通 Workspace 的团队成员。
- 在 Buildr 自举 Workspace 开发和验证当前 checkout 的维护者与 Agent。
- 运行 Buildr release 与 self-bootstrap activation 的发布维护者。

## 核心流程

开发命令显式运行 `projects/product/buildr`。Formal Finish 后，self-bootstrap runner按冻结贡献执行适用的sync、Git和`Buildr Web Dev`安装，再用Environment retained Node验证retained Project bridge，最后通过同一入口执行指定Agent Doctor或恢复同一Finish run。整个流程不解析或修改PATH默认`buildr`。

## 关键变化

- `install:development` 删除 development CLI 安装和PATH smoke。
- self-bootstrap action/stage从安装与验证默认CLI改为验证显式development entry。
- root Rule和release Skill不再要求默认PATH绑定checkout。
- 规格、当前知识、文档和测试同步保护身份边界。
- legacy CLI安装/卸载脚本暂留用于后续可恢复迁移，但不再由canonical流程调用。

## 影响、风险与兼容性

现有`~/.local/bin/buildr`等legacy wrapper不会被本Change删除，避免静默改变机器状态；它将在新npm候选版发布后的独立迁移步骤中备份或清理。外部Workspace在新版本发布前不应使用rc.8重新doctor/sync。self-bootstrap result仍保留现有schema，但内部阶段和evidence语义随本Change更新。

## 验收摘要

- canonical development preparation只安装`Buildr Web Dev`，对默认PATH零副作用。
- self-bootstrap不调用development CLI installer，也不解析PATH默认`buildr`。
- runner通过Environment retained Node执行`projects/product/buildr version --json`并验证checkout identity。
- 最终Doctor与same-run resume只使用该显式入口。
- release preparation把retained checkout与npm发布物验证分开。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
