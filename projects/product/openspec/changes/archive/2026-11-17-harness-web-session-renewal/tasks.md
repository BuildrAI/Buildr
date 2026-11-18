# 实施清单

- [x] 1. `web-session-store.ts`：会话窗口改为 30 天常量；新增续期动作（存储锁内按哈希匹配、仅延长未过期会话，剩余寿命高于窗口一半时零写入）；`exchange` 按新窗口签发；`revoke`/`rebind`/票据语义保持不变。
- [x] 2. `web-endpoint.ts`：`authorize()` 认证成功后触发续期检查；`GET /`、`/index.html` 会话有效时按服务端剩余寿命刷新 `Set-Cookie`（同 token、HttpOnly、SameSite=Strict、Path=/）；票据兑换 `Max-Age` 对齐新窗口；门槛页与失效文案不变。
- [x] 3. 测试：在 `test/integration/harness-web.test.ts`（及必要的单元测试）补充——活动续期延长有效期、高频认证不重复落盘、超过不活动窗口拒绝、续期不复活已撤销/已换绑会话、文档加载刷新 Cookie 且 `Max-Age` 不超过服务端剩余寿命、既有 8 小时记录兼容续期；回归票据一次性、换绑撤销、登出、Host/Origin 围栏。
- [x] 4. 运行 `services/buildr-harness` 的 `npm run typecheck` 与相关单元/集成测试，修复失败。（typecheck 通过；harness-web.test.ts 4/4；登记检查组 agent-integration-harness-product 9/9，含真实代次交接保留页面凭据。）
- [x] 5. 知识核对：按最终实现核对 `knowledge/docs/architecture/harness-products.md` 登录段落与 `knowledge/docs/architecture/buildr-data-design.md` 会话存储表述；现有文字未含固定时长，仅在表述失准时最小校准，补充会话按活动续期一句说明。（harness-products.md 已补充滑动续期段落；buildr-data-design.md 会话存储表述仍准确，未改写。）