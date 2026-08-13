## 1. npm-only 产品与 payload 收敛

- [x] 1.1 保留 deterministic application payload、完整 CLI/Web、migrations、Web dist、package baseline 与许可证，删除 SEA/platform envelope 的构建入口与依赖。
- [x] 1.2 收敛 npm tarball inventory：包含 Launcher 管理能力但不包含 Node、SEA、已生成 `.app`/shortcut、PKG/MSI、平台签名或 installer toolchain。
- [x] 1.3 将 runtime role 与 installation origin 收敛为 npm Host Node、Workspace Node、development 和 unknown，移除当前 Product Node/platform installation 正式分支。

## 2. 本机 Launcher binding 与 lifecycle

- [x] 2.1 定义 closed npm Launcher binding/ownership identity，绑定 formal npm origin、Host Node executable、package entry、prefix、payload/protocol 与 target，并实现逐字段漂移验证。
- [x] 2.2 重写 macOS Launcher 为无 Node/package/payload 复制的本机 `Buildr Web.app` wrapper，加入 ownership guard、原子 install/repair、status、uninstall 与本机 ad-hoc signing。
- [x] 2.3 重写 Windows Launcher 为精确 target/arguments 的 Start Menu shortcut，加入相同 binding、ownership、repair/status/uninstall 与 foreign target 防护。
- [x] 2.4 接入 `buildr web launcher install|status|repair|uninstall`，确保普通 npm install 默认零桌面副作用，图形启动只执行 binding 中的同一 npm Buildr `web`。
- [x] 2.5 让 npm postinstall/update 仅对已存在且同 ownership Launcher 原子刷新 binding；authority、Node、entry、package、prefix 或 payload 漂移时 fail closed。

## 3. 更新、Doctor 与运行隔离

- [x] 3.1 将 `buildr update` 收敛为 npm/development 两种可证明来源，npm 模式只使用登记的 Host Node/npm CLI/prefix 并删除 platform installer update route。
- [x] 3.2 更新 installation registry、Doctor/status、version/Web health JSON 与 human projection，分别展示 npm、development、Launcher binding、current instance 和 Host/Workspace runtime identity。
- [x] 3.3 验证 CLI 与 Launcher 主进程固定使用 Host Node，Workspace-owned npm、verification、Finish adapter 和项目命令只使用声明 Workspace Node，产品更新不改变 Workspace runtime。

## 4. 发布链与未交付平台实现退出

- [x] 4.1 删除 Product Node download/trust、SEA injection、macOS PKG、Windows MSI、platform manifest/checksums、previous lineage、Release Asset ensure/readback 与 native candidate 实现和依赖。
- [x] 4.2 将 `.github/workflows/publish.yml` 收敛为唯一 contract/payload/tarball、可逆 npm/Launcher smoke、protected npm publish 与 Registry integrity/readback，同一 tarball 不重建。
- [x] 4.3 更新 release checklist、README、CLI/reference/known-limitations，删除当前平台下载、签名、公证和矩阵承诺，并记录未来恢复条件。

## 5. 测试与验证能力建设

- [x] 5.1 新增 Unit/Integration 契约测试覆盖 Launcher binding normalization、单字段漂移、ownership、foreign target、原子 repair 与 safe uninstall。
- [x] 5.2 新增 macOS/Windows System 测试覆盖普通 npm install 零桌面副作用、显式 Launcher install/status/launch/repair/uninstall、无复制 inventory 与同 identity Web readiness。
- [x] 5.3 更新 npm tarball、Host Node、runtime-role、update、Doctor/status、release workflow/Registry readback 测试，并删除 SEA/installer/signing/asset matrix 的当前门禁。
- [x] 5.4 收敛 verification registry、`verification.yml` 和 changed-path owner，使正式能力只声明 full regression 与 npm release artifact set。

## 6. 当前认知与 Change 收敛

- [x] 6.1 更新 Brief、overview、产品/技术架构、open-source release flow、buildr Service 说明、产品文档与 glossary，定义“npm 唯一正式渠道”和“本地 Launcher 投射”。
- [x] 6.2 完成 terminology reconcile 与 `.buildr/knowledge-impact.yml`，确认 Product Node/Platform Product Unit 只作为未来/历史术语而非当前 runtime。
- [x] 6.3 运行 OpenSpec strict、相关测试、npm candidate与 workflow/static checks，修复全部当前 Change correctness 问题。
- [x] 6.4 勾选全部真实完成项并执行 deterministic OpenSpec converge/archive；不得把 Formal Verification、Completion Review、Task Finish 或发布动作写入 Change checklist。
