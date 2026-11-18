## Why

rc.60 直到正式验包才发现安装和退出清理问题。把这两个边界提前到相关开发改动的验证中。

## What Changes

- 只对打包、安装和启停相关输入或显式请求执行一次本机真实安装冒烟。
- 临时包和诊断不替代正式发版原包与验收。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`：相关改动选择轻量真实安装验证。

## Impact

Buildr 主包相关验证、已有冒烟入口与验证声明；不触发远端或公开发版。
