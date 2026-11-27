## Why

新对话打开右栏时会带入旧对话的全局 Buildr 页签。本机 Buildr 服务已停止时，入口需要手动恢复服务。左右入口的图标也不一致。

## What Changes

- 将右栏 Buildr 页签保存在打开它的对话。
- macOS 上按需调用默认本机 Buildr Dev 启动器。
- 左侧入口、添加面板及页签使用同一个 Buildr 线条图标。

## Capabilities

### Modified Capabilities

- `cindy-desktop-integration`：对话页签归属和本机服务按需启动。

## Impact

影响 Cindy 桌面右栏及本机 Buildr 插件。
