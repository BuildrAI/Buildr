# 拆分 Workspace CLI 与创建流程

## 一句话摘要

把729行Workspace聚合CLI拆成Workspace、Project、Service三个独立Adapter，并将创建、Git与Manifest业务职责迁回所属Application和Repository。

## 背景与问题

当前CLI同时承担接口解析、Project/Service创建、Git与文件操作、Manifest兼容映射和终端输出，绕过已建立的Application与Repository边界，形成CLI专用writer。

## 目标与非目标

目标是让CLI只做协议适配，让Project/Service Creation Application拥有创建用例，让Repository成为Manifest兼容读写唯一owner。原Application体量合理，不机械拆Query/Command。

本切片不改变公开命令、参数、输出、错误、Git副作用、Manifest格式或前端页面。

## 核心流程

CLI参数 → 所属Application输入 → Domain规则与Git/filesystem Infrastructure → 所属Manifest Repository → CLI结果输出。

## 关键变化

- Workspace、Project、Service分别拥有CLI Adapter。
- Project/Service创建和附接归所属Creation Application。
- Manifest/YAML兼容实现归所属Repository。
- 原Project/Service Application保持不机械拆分，创建副作用形成独立文件。
- module直接把Application注入CLI contribution。

## 影响、风险与兼容性

影响Workspace后端CLI、Project/Service Application、Manifest Repository和模块组合。风险主要是CLI文案、输出顺序、Git失败恢复和v1/v2兼容漂移；通过CLI、Manifest、Project/Service与Workspace生命周期回归控制。

## 验收摘要

旧聚合CLI不再包含Project/Service业务和Manifest读写；三个领域Adapter边界清晰；Application和Repository owner唯一；公开行为及副作用保持兼容；适用验证通过。

## 技术产物入口

- `proposal.md`
- `design.md`
- `specs/product-source-layout/spec.md`
- `specs/workspace-control-plane-module-architecture/spec.md`
- `tasks.md`
