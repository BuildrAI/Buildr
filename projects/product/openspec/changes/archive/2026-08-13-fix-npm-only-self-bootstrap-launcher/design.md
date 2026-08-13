# Design: npm-only self-bootstrap Development Launcher

## Context

公开 Launcher 现在绑定经过验证的 npm installation identity；Buildr 自举 Workspace 仍需要独立的 `Buildr Web Dev`，它绑定 retained checkout 和 retained Node，不属于 npm 产品安装，也不能通过公共命令伪装为 npm Launcher。

## Goals / Non-Goals

### Goals

- 让 post-Finish self-bootstrap activation 使用独立内部 manager 安装 Development Launcher。
- 证明 Launcher source checkout、Node executable 与 delivered successor commit 一致。
- manager 失败或返回漂移事实时 fail closed。

### Non-Goals

- 不恢复公开 development channel 参数。
- 不复制 Node、Buildr package 或源码形成第二 runtime。
- 不引入 SEA、平台 installer、签名、公证或公开平台资产。

## Decisions

### Decision: retained Node 直接执行内部 manager

closeout 直接执行 retained checkout 的 `package/launchers/manage.mjs install --channel development`，不经过公开 CLI registry。该入口只属于 self-bootstrap/development installer，公开 `web launcher` 仍保持 npm-only。

### Decision: closed result validation

closeout 只接受 development channel、installed 状态以及精确 source root、Node executable 和 successor commit 相等的 manager 结果。任何缺失、非零退出或 identity 漂移都在最终 Doctor 和 same-run Finish resume 前阻断。

### Decision: 单一 component contribution

`buildr-self-bootstrap-sync` Skill 与 Task Finish post-Finish contribution 同步升级，使 frozen Task Contribution 在运行时获得同一 manager 契约；development installer 复用相同入口。

## Risks / Trade-offs

- 内部 manager 仍是开发专用受信入口，必须由调用方固定绝对 checkout 与 Node；测试覆盖不得退化为 PATH 查找。
- macOS 本机 wrapper 可继续 ad-hoc signing，但不代表 Developer ID 公共发行。

## Migration Plan

同步 Skill/component contribution，交付后由唯一 self-bootstrap runner 安装新 Development Launcher、验证默认 CLI 与 Doctor，再 resume 原 Finish。旧 `--channel development` 公共调用不保留兼容层。
