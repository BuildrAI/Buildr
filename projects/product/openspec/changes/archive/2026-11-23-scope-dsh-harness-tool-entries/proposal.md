## Why

日常 DSH 的原生对话里也显示了只供 Buildr Harness 使用的两个右栏入口，使不可用的工具看起来可以正常打开。

## What Changes

- 只在 Buildr Harness 当前可用且右栏匹配当前工作空间时显示两个新建工具入口。
- 回到 DSH 原生会话，从「开始」和「更多工具」撤回两个入口，不改变 DSH 原生工具和已有标签。

## Capabilities

### Modified Capabilities

- `harness-dsh-desktop-plugin`：限定 Buildr 扩展入口的展示范围。

## Impact

DSH 开发插件客户端和桌面验收；不更换 Harness 后端或已打开工具页。
