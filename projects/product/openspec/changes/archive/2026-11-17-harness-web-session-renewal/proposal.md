# 独立网页页面会话按活动续期

## Why

独立 Harness 网页的页面会话与浏览器 Cookie 目前是固定 8 小时寿命且从不续期：用户从启动器打开后长期保留同一浏览器页签，超过 8 小时（如隔夜）刷新即回到"请从启动器打开"门槛页，必须重新走启动器，失效时机不可感知。兼容重启/更新本身已按规范保留会话，但固定寿命让"同一浏览器刷新即可继续"这一基本预期在日常开发中反复落空。

## What Changes

- 页面会话由固定 8 小时改为按认证活动滑动续期：每次通过认证的请求在剩余寿命低于阈值时延长有效期，不活动窗口为 30 天；续期写盘节流，不逐请求落盘。
- 文档加载（`GET /`、`/index.html`）在会话有效时同步刷新浏览器 Cookie 的 `Max-Age`，使 Cookie 不先于服务端会话失效；票据兑换时按新窗口设置 Cookie。
- 兼容换代后继续校验会话当前有效期与撤销状态（原措辞"原有效期"调整为续期后的当前值）。
- 不变：票据仍为 30 秒一次性且绑定目标端点；换绑端口仍撤销全部旧网页登录；显式登出撤销不变；Host/Origin 与同源写入校验、按端点隔离的会话命名不变。
- 无破坏性变更：磁盘会话记录格式不变，既有未过期会话继续有效并在首次活动后按新窗口续期；已失效会话仍需从启动器重新打开一次。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `harness-web-composition`: "启动登录必须绑定准确网页入口而不泄露服务秘密"要求补充页面会话滑动续期与 Cookie 寿命同步语义，并新增长期使用后刷新恢复的场景；换绑撤销与票据约束保持原文。

## Impact

- `services/buildr-harness/src/process/web-session-store.ts`：会话有效期常量、续期动作与节流。
- `services/buildr-harness/src/process/web-endpoint.ts`：认证路径触发续期；文档加载刷新 Cookie；兑换 Cookie `Max-Age` 对齐新窗口。
- `services/buildr-harness/test/integration/harness-web.test.ts` 及必要的单元测试：续期、不活动过期、撤销/换绑不回归、Cookie 刷新。
- 知识：`knowledge/docs/architecture/harness-products.md` 登录段落按最终事实核对（现有表述未含固定时长，预计仅小幅补充）。