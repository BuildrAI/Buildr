## Why

Buildr 自举激活会在刷新 `Buildr Web Dev` Launcher 前停止其健康 HTTP 实例，但安装完成后不会恢复服务；因此一次命中 Local App 影响路径的开发交付会让原本可用的 Buildr Web Dev 无提示失效。现在需要补齐 activation 的服务连续性契约，同时保持“未运行时不自动启动”的按需语义。

## What Changes

- self-bootstrap activation 在安装前认证并记录健康的默认 development 实例及端口。
- Launcher 更新后，仅当安装前存在健康 development 实例时，使用 retained Project bridge 在同一端口、以新 Launcher identity 恢复服务并等待健康。
- 原本未运行、陈旧或属于其他 channel 的实例不触发自动启动。
- 恢复失败或新实例 identity 不匹配时 fail closed，停止最终 Doctor 或 same-run Finish resume，并清理本次启动的异常子进程。
- activation result 增加服务连续性 evidence；不引入新的持久 store、Task Environment resource 或公共 Launcher channel。
- 本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-package-assets`: self-bootstrap Development Launcher 安装必须保持安装前健康默认实例的同端口连续性，并明确未运行与恢复失败边界。

## Impact

- `skills/buildr-self-bootstrap-sync` 的本地 runner、辅助启动脚本与 Skill 契约。
- Buildr Product 的 self-bootstrap integration/system verification。
- `buildr-package-assets` canonical capability 的 activation requirements。
- 不修改 npm-owned `Buildr Web`、公开 `buildr web launcher`、Task preview 或 Task Environment cleanup。
