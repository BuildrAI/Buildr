## Why

独立网页首次随机端口后不可更换，无法满足用户固定入口要求。

## What Changes

- Harness development 默认9519，released 默认9518；显式 --port 可覆盖，启动器按绑定profile选用。
- 已有网页通过第一方本机接口、准确观察的端点及原端口安全换绑；先监听新地址，失败保留旧地址，成功仅关闭旧网页连接并撤销旧页面登录，不停止Agent执行。
- Development的端口、入口、资料域保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `harness-web-composition`: 固定默认端口与受保护网页换绑。

## Impact

Harness CLI、共享后台网页管理、页面会话；已有启动器按profile继承，无需新配置格式。不改变原生执行与Development协议，不公开发布或调用真实模型。
