## Context

当前候选已经实现统一 application payload、npm 完整 CLI/Web、安装 identity、Host Node/Workspace Node 分离，也实现了尚未 Finish 的 Product Node SEA、macOS PKG、Windows MSI、签名、公证、GitHub Release Assets 与原生生命周期门禁。新的产品决定认为后一组能力与 Buildr 当前“开发者 CLI + 本机 Web”阶段不匹配：正式用户已经通过 npm 安装 Buildr，图形入口只需要把同一个 npm Buildr 以 `web` 参数启动，不应再构成第二个产品安装或更新单元。

本 Change 在同一 active Task 中替代旧 Candidate，而不改写已归档历史。旧 SEA/installer 设计保留在 archive 与知识中的未来条件说明；canonical 当前行为、实现、workflow 和验证只表达 npm-only 模型。

## Goals / Non-Goals

**Goals:**

- 让 npm Registry 成为唯一正式分发位置，单一 tarball 同时提供完整 CLI、Buildr Web 和本地图形 Launcher 管理能力。
- 让 macOS `.app` 与 Windows Start Menu shortcut 只保存经过验证的 npm binding，并精确执行同一 Host Node + package entry 的 `web` 命令。
- 让 Launcher lifecycle 显式、可诊断、可修复、可卸载，普通 npm install 默认零桌面副作用。
- 保留 application payload、installation identity、update authority、Doctor/status、Registry integrity readback 和 Host/Workspace Node 分离。
- 删除 SEA、Product Node、PKG/MSI、签名、公证和 GitHub Release 平台资产对当前代码、CI 和发布操作的维护负担。

**Non-Goals:**

- 不发布或下载 `.app`、`.pkg`、`.dmg`、`.msi`、Setup EXE 或 SEA。
- 不为普通用户提供“无需安装 Node”的当前渠道。
- 不实现 Buildr App、WebView、Electron、Tauri 或原生桌面客户端。
- 不复制 Host Node、Buildr package、application payload 或源码到 Launcher。
- 不在本 Change 创建 tag、发布 npm、推送、执行 Task Finish 或修改真实 GitHub Release。

## Decisions

### 1. npm 安装是唯一产品 installation authority

正式 `installation-origin` 只为 npm package 保存 package、version、protocol、payload digest、source commit、package root、entry、Host Node 与 npm prefix/update authority。development 保持独立 channel；platform channel、Product Node receipt、platform update unit 和 product installer registry 从当前模型删除。

选择单一 npm authority，是因为它已经拥有 package bytes、版本、更新与卸载生命周期。Launcher 不重复这些事实，只引用一份已验证 binding。替代方案是保留 platform channel 但不公开发布；这仍会迫使 update/status/workflow 长期维护不可达分支，因此不采用。

### 2. Launcher 是可重建的本机投射，不是 package payload 的副本

`buildr web launcher install` 从当前正式 npm installation 生成 closed binding，至少冻结：installation ownership identity、package/version/payload/protocol、Host Node executable 及摘要、package entry 及摘要、package root、npm prefix、launcher target 和生成版本。写入前重新校验 formal origin 与 payload binding；非 npm、authority 不完整或目标 ownership 不可证明时 fail closed。

macOS wrapper 是一个最小 `.app` Bundle，`CFBundleExecutable` 为固定薄脚本/本机 wrapper，只读取 Bundle 内 binding 并以绝对 Host Node executable + 绝对 package entry + `web --launcher-binding <binding>` 启动。它不复制 Node、package 或 payload；允许本机 ad-hoc signing 仅用于 Bundle 结构稳定。Windows 只创建 Start Menu `.lnk`，target 为已登记 Host Node，arguments 为已登记 package entry 与 `web --launcher-binding <binding>`，并保存相邻 closed binding/ownership metadata。两者都不通过 PATH 解析 Node、npm 或 Buildr。

选择直接绑定 Host Node + package entry，而不是调用 shell 中的 `buildr`，是为了避免 PATH、shim、prefix 和多版本并存时的来源猜测。选择可重建投射而不是永久 wrapper update service，是为了让 npm 安装继续拥有唯一更新责任。

### 3. Launcher lifecycle 只由显式 CLI 管理

- `install`：普通 npm installation 中显式创建；目标缺失或已由同一 ownership identity 管理时原子写入/替换，foreign target 停止。
- `status`：只读验证 binding、Host Node、entry、package root、payload/origin 与 target structure，返回 `ready|stale|invalid|absent` 和 repair action。
- `repair`：只接受仍可验证的当前 npm installation；重新生成 binding/target，不能借 repair 改绑到另一安装或从 PATH 搜索替代品。
- `uninstall`：只删除 ownership identity 精确匹配的 Launcher 文件/shortcut/binding，不删除 npm package、Workspace Registry、SQLite、日志或 Workspace data。

npm postinstall/update 成功后只在已存在且 ownership 属于同一 installation 时原子刷新 binding；从未安装 Launcher 时保持零桌面副作用。npm uninstall 无可靠跨平台 preuninstall 保证，因此残留 wrapper 在启动/status 时必须 fail closed 并提示通过新安装执行 repair/uninstall，不能转而寻找 PATH 中的替代 Buildr。

### 4. Host Node 与 Workspace Node 保持严格分层

npm Buildr 主进程始终使用启动已安装 package 的 Host Node。只有 Workspace-owned npm、验证、Finish adapter 和项目执行通过 Workspace resolver 使用 `.buildr/workspace.yml` 精确声明的 Workspace Node。二者即使版本相同也不共享 identity、更新或卸载 lifecycle；Launcher 绑定 Host Node，不绑定或启动 Workspace Node 作为主进程。

Product Node/SEA 只作为未来条件保留在历史设计，不进入 current enum、Doctor channel、update route 或 verification matrix。

### 5. application payload 保留，但成为 npm 内部单一构建产物

payload builder 继续一次生成 runtime bundle、worker、Web dist、migrations、package baseline、licenses 和稳定 digest；npm staging 只消费该 frozen payload。移除 SEA injection、platform resource envelope 与跨平台 digest 汇聚，但保留 payload inventory/verify，因为它能防止 npm tarball 重新回到源码 checkout 或开发 toolchain 依赖。

### 6. release workflow 只冻结一个 npm tarball

tag workflow 解析 package version/tag/commit/dist-tag 与 release notes，构建一次 application payload、执行一次 `npm pack`，随后全部 smoke、protected `npm publish` 和 Registry integrity readback 都消费同一 tarball。所有可逆 npm/Web/Launcher inventory 与 lifecycle 验证先于 publish；Registry 已存在相同 integrity 时复用，漂移时停止。

GitHub Release 可以继续承载与 tag 匹配的 release notes 元数据，但不上传 npm tarball、Launcher、manifest/checksums 或平台二进制。GitHub Actions artifact 只保存同一 tarball 和验证 evidence，不是公共下载地址。删除 platform matrix、sign/notary environments、previous-platform lineage 与 Release Asset ensure。

### 7. 未来平台渠道必须由新的产品决策重新引入

只有普通用户不应安装 Node、Buildr App 出现、企业要求独立可管控单元或 npm/Node 已成为明确转化障碍时，才通过新的 OpenSpec Change 恢复 Product Node/SEA/installer。恢复时可参考旧 archive，但必须重新验证当时 Node SEA、签名、平台 runner、安装事务和发布凭证，不能把本轮删除的实现视为 dormant supported code。

## Risks / Trade-offs

- [Host Node 或 npm prefix 更新后 Launcher binding 变旧] → postinstall/update 对已存在同 ownership Launcher 原子刷新；启动/status 对任何摘要或路径漂移 fail closed，并提供 `repair`。
- [npm uninstall 后遗留本机 Launcher] → wrapper 不寻找替代安装，显示明确失效提示；后续相同 package 安装可执行 `launcher uninstall|repair`。
- [macOS 本机 wrapper 未经 Developer ID 签名] → 不作为下载制品分发，只允许本机 ad-hoc signing；文档明确 Gatekeeper 公共分发不在当前承诺中。
- [多个 npm prefix 并存] → 每个 binding 以 installation ownership identity、package root、entry、Host Node 和 prefix 闭合；foreign target 不覆盖，status 分别报告。
- [删除平台实现降低未来复用速度] → archive 保留设计与原因；当前代码不承担未发布分支的持续兼容成本，未来按届时约束重建。
- [npm/Node 对普通用户形成门槛] → 当前目标用户接受该依赖；将安装转化数据作为未来恢复平台渠道的决策输入。

## Migration Plan

1. 创建新 delta，撤销平台正式能力并定义 npm Launcher binding/lifecycle；刷新 Planning Review。
2. 保留 payload/npm/identity/Host-Workspace runtime 核心，删除 Product Node、SEA、PKG/MSI、platform manifest/assets/readback 与 workflow matrix。
3. 将现有 Launcher build/manage 重写为无复制的 npm binding wrapper，并接入显式 CLI、postinstall/update refresh、status/Doctor。
4. 更新 release workflow、verification registry/declaration、README、release checklist 与 current knowledge。
5. 验证最终 npm tarball inventory、多个 Host Node、CLI/Web、Launcher install/status/repair/uninstall、漂移/foreign target/多 prefix、普通 install 零桌面副作用和 Registry release contract。
6. deterministic converge/archive，重新形成 Content Target、formal Verification、Completion Review、Candidate 与 Development Handoff。

回滚到本 Change 之前意味着恢复旧 Task worktree 中的双渠道候选，但不能直接发布；任何 SEA/平台渠道恢复仍需要新的产品授权与正式验证。

## Open Questions

没有阻塞实现的产品决策。macOS Launcher 默认安装位置与 Windows Start Menu 路径沿用当前 Buildr-owned launcher 约定；实现必须通过 ownership guard 防止覆盖 foreign entry。
