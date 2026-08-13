# 将 Buildr 收敛为 npm-only 分发与本机 Launcher

## 一句话摘要

Buildr 只通过 npm Registry 分发完整 CLI 与 Buildr Web，图形 Launcher 是同一 npm installation 的显式、本机、无复制投射，不是第二个产品或更新渠道。

## 背景与问题

上一轮候选已完成 application payload、Host/Workspace Node 分离，也实现了 SEA、PKG/MSI、平台签名、公证和 GitHub Release Assets。新的产品判断认为 Buildr 当前目标用户已有 Node/npm，图形入口只执行 `buildr web`；继续维护自包含平台产品的成本明显高于当前价值。尚未 Finish 的旧 Handoff 因目标改变不能交付，需要在同一 active Task 中重新收敛。

## 目标与非目标

目标是让 `@buildr-ai/buildr` 成为唯一正式安装，保留完整 CLI/Web、统一 payload、npm identity/update/Registry readback 与 Host/Workspace Node 分离；提供显式 `buildr web launcher install|status|repair|uninstall`，生成不复制 Node、package 或 runtime 的 macOS `.app`/Windows shortcut。非目标是发布 SEA、PKG/MSI、平台 binary、签名/公证能力或真正桌面 Buildr App，也不执行 tag、publish、push、Task Finish。

## 受影响角色

- npm 用户：安装一次 Buildr即可使用 CLI/Web，并可显式生成图形入口。
- Workspace 维护者：Workspace Node 继续由版本化声明拥有，不受 npm 更新或 Launcher repair 影响。
- 发布维护者：只冻结、验证、发布和回读一个 npm tarball，不再维护平台矩阵与签名基础设施。
- 未来普通用户/企业渠道：当前不提供无需 Node 的 installer，出现明确需求后以新 Change 恢复。

## 核心流程

CI 一次构建 application payload并执行一次 `npm pack`；Host Node smoke、Launcher lifecycle、protected publish 和 Registry integrity readback全部消费同一 tarball。普通 npm install 不创建图形入口；显式 launcher install 从 formal origin 生成 closed binding，冻结 Host Node、package entry、prefix 与 payload identity。点击后精确执行该 entry 的 `web`；任何漂移停止并提示 repair。

## 关键变化

- 删除当前 SEA、Product Node、PKG/MSI、签名、公证、platform manifest/checksums/Release Assets 与原生 matrix。
- npm tarball继续包含完整 payload并新增 Launcher 管理代码，但不携带已生成 Launcher 或第二份 runtime。
- Launcher lifecycle显式、可诊断、可修复、ownership-safe；npm update只刷新已存在 matching binding。
- Doctor/status/update/public JSON只表达 npm、development、Launcher、current instance 与 Host/Workspace Node。
- 旧平台设计保留在已归档 Change，当前代码和发布链不承担 dormant supported branch。

## 影响、风险与兼容性

现有未发布 platform candidate被明确撤销，不能 Finish或公开。使用者需要兼容 Node 24 与 npm；macOS wrapper只做本机 ad-hoc signing，不承诺 Developer ID/Gatekeeper公共分发。多个 npm prefix通过 ownership identity隔离，foreign target不覆盖。未来平台渠道必须重新验证届时 SEA、签名、安装与发布条件。

## 验收摘要

- npm tarball包含完整 CLI/Web/payload/Launcher管理能力，无 Node、SEA、installer或已生成图形入口。
- 最低/当前 Host Node上 CLI、Web、health/readiness 与 Workspace-owned runtime role通过。
- 普通 npm install零桌面副作用；显式 Launcher lifecycle与单字段漂移、foreign target、多 prefix、repair/uninstall均可验证。
- CLI/Launcher/Web报告同一 npm Buildr、Host Node、protocol、payload和ownership identity；Workspace Node独立。
- publish workflow只处理一个不可变 tarball，并以 Registry integrity完成恢复和公开readback。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
