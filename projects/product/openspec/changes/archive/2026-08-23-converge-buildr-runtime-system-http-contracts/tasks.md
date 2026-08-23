## 1. Runtime/System contract authority

- [x] 1.1 在 Web HTTP、System Installation 与 System Publication Interfaces 建立模块内 Draft 2020-12 Schema、稳定 `$id`、operation metadata 与严格 validator 复用。
- [x] 1.2 建立全局 Local App operation inventory/coverage check，为 JSON、binary、deferred、not-applicable operation 保存唯一 owner 与理由并拒绝未知或重复项。

## 2. Local App、Installation 与 Publication pipeline

- [x] 2.1 将 health、session quit 与 instance-secret quit 接入请求/成功/错误契约，保持 security precedence、跨进程兼容、响应先于 shutdown 和无副作用失败。
- [x] 2.2 将 release-awareness、Publication list/detail 接入显式 DTO/Application mapping，并将 Publication asset 作为 binary contract 保留路径与 MIME 安全语义。
- [x] 2.3 建立真实 HTTP Contract Test，覆盖合法 JSON/binary 响应、统一错误、未知/非法输入、不变异、授权失败和 operation coverage。

## 3. Generated DTO 与 Buildr Web

- [x] 3.1 扩展后端/前端 Runtime/System DTO 的确定性生成与 drift check，确认 Buildr Web 与非 Web CLI 不新增 Ajv/生成器运行依赖。
- [x] 3.2 新增 Runtime/System typed Client，让 `AppLayout` 与 Articles 页面消费生成 DTO，并移除同一 payload 的手写类型和分散 `as` 断言。

## 4. Current knowledge 与 convergence readiness

- [x] 4.1 创建并维护同级 `brief.md` 与 `.buildr/knowledge-impact.yml`，核对 Runtime/System HTTP、binary disposition、全局 coverage 和术语影响。
- [x] 4.2 运行受影响 Contract/Unit/System tests、Buildr Service/Buildr Web typecheck、DTO drift 与正式 Buildr Web build，修复实现反馈并刷新 tracked `web-dist`。
- [x] 4.3 完成 Application Payload、npm tarball parity 和代表性 Browser Smoke，确认 Doctor/Launcher/release ownership、非 HTTP CLI 冷启动与既有安全边界未改变。
