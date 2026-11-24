## Why

修复 DSH 安装与账号 Remote 版本不匹配。

## What Changes

按准确软件包版本同步安装校验和 Remote 选择，保留原安装、账号与历史；验证隔离 rc.5 候选。

## Capabilities

### Modified Capabilities

- `agent-program-upgrade`：DSH 独立程序的依赖与账号协议必须对应发布版本。

## Impact

Buildr Harness 的既有账号和程序操作。
