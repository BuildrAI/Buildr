## Why

DSH 插件的「Buildr 开发版」打开入口在运行实例与当前来源不匹配时只返回诊断文案，要求用户自己找到旧实例正常退出、再重新点击接入。并行开发 Buildr 时源码字节变化是常态，该提示高频出现，恢复完全靠人工。目标与范围见[任务说明](@task/dsh-dev-entry-restart-on-mismatch)。

## What Changes

- `buildr web` 增加显式 `--replace-mismatched-development` 路径：仅 development profile，健康但来源不匹配（或缺来源证明）的旧实例在启动锁内经既有认证退出与有界等待正常停止后，按当前产品身份启动新实例；退出失败、等待超时或实例被替换保留现场并明确诊断，不杀进程、不启动第二实例。
- DSH 插件桥接在 development 渠道遇到 `instance-mismatch` 时，经既有入口发起上述显式重启并完成打开，全程共享同一次有界打开与取消；npm 渠道行为不变，不匹配诊断保持。
- 不对用户暴露「指纹」概念：打开即恢复；显式重启只作用于可证明是同一 development profile 的旧实例。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-instance-lifecycle`：新增「显式替换来源不匹配的开发实例」要求；npm 更新交接与既有复用语义保持。
- `dsh-desktop-integration`：在「不自行终止程序」边界内，新增用户打开动作驱动的来源不匹配接入重启；「只接受已证明匹配的开发程序」保持。

## Impact

- `projects/product/services/buildr`：`src/web/application/instance-lifecycle.ts` 的启动编排复用既有 shutdownInstance/waitForExit/启动锁块，新增显式 flag 与诊断；`src/web/interfaces/cli/web.ts` 的选项说明。
- `projects/product/services/dsh-plugin`：`plugin/bridge.ts` 打开流程增加 recovery 编排钩子；`plugin/process.ts` 为 development 渠道 spawn 注册入口带 `--replace-mismatched-development --no-open`。
- 测试：`dsh-plugin/test/unit/bridge.test.ts` 恢复路径回归；`buildr` 集成测试覆盖不匹配退出重启、缺证明仍诊断、超时保留现场、npm 渠道不变。
- 兼容性：`buildr web` 新增显式 flag 不影响默认行为；旧实例 receipt schema、安装状态查询格式与 npm 更新交接不变。
