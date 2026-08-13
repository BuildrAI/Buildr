# 修复 npm-only 自举 Launcher 激活

## 一句话摘要

把 self-bootstrap 的 `Buildr Web Dev` 激活从 npm-only 公共 Launcher 命令移到 retained checkout 的独立内部 manager，并对 checkout、Node 与 successor identity fail closed。

## 背景与问题

Buildr 已采用 npm-only 正式分发，公开 Launcher 只投射已登记 npm 安装；旧 closeout 仍传 `--channel development`，会在最终自举阶段失败并阻断 Task Finish。

## 目标 / 非目标

目标是修复 Development Launcher 的内部安装、结果验证和 component 投射契约。非目标是不恢复平台正式渠道、SEA、PKG/MSI、签名公证或公开 development channel。

## 核心流程

1. Finish 交付 retained successor。
2. 唯一 self-bootstrap runner 用 Environment Receipt 的 retained Node 直接执行 successor checkout 内部 manager。
3. runner 验证 development channel、source root、Node 与 successor commit。
4. 通过后继续默认 CLI identity、Doctor 与 same-run Finish resume；失败则停止。

## 验收摘要

- public launcher 不接受 development channel。
- internal manager 安装/刷新 `Buildr Web Dev` 且不创建 npm-owned Launcher。
- manager 非零、invalid JSON 或 identity 漂移时 closeout fail closed。
- Contract、Integration、System、package/static、OpenSpec 与正式 Product verification 通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Buildr package assets delta](specs/buildr-package-assets/spec.md)
- [Implementation tasks](tasks.md)
