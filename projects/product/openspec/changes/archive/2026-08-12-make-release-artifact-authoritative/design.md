## Context

`dev → main` 已在 macOS、Windows 上完成冻结 Candidate 验证，tag workflow 仍再次运行完整 Candidate，并用 `npm publish` 从 checkout 隐式重新打包。发布前 smoke 所见制品与 registry 实际收到的制品因此没有显式 identity 绑定；workflow 在 npm publish 后中断时，GitHub Release 创建也不能安全重跑。

npm 官方契约允许 `npm publish <tarball>`，发布时 registry 保存 tarball 的 SHA-1 与 SHA-512 integrity。GitHub-hosted workflow 使用 npm 11.5.1、`id-token: write` 与既有 trusted publisher 时，`npm publish` 自动使用 OIDC 并生成 provenance，无需 token 或额外 `--provenance`。

## Goals / Non-Goals

**Goals:**

- 一个 tag workflow 只生成一个正式 tarball，后续本地验证、发布和 evidence 都引用它。
- 发布前证明 package identity、inventory、digest 与安装后 CLI 生命周期。
- registry 已有目标版本时，核对远端 integrity 后安全恢复，不重发不可变版本。
- GitHub Release 创建可重入，发布后从官方 registry 安装精确版本并验证。
- tag workflow 不再运行完整 Candidate。

**Non-Goals:**

- 不改变 Candidate、Windows 预检或 Host Node 矩阵。
- 不引入 staged publishing，也不改变 npm trusted publisher 配置。
- 不自动移动既有 dist-tag、不删除 npm version、不回滚已创建 tag 或 GitHub Release。
- 不在本任务中实际发布版本。

## Decisions

### 1. Release artifact manifest 是本次 workflow 的制品身份

新增 release artifact preparation 脚本，调用一次 `npm pack --json`，并生成 manifest，至少包含 package name/version、tarball filename、size、SHA-256、SHA-512 integrity 和 npm pack 文件清单。脚本同时输出 GitHub Actions 可消费的 tarball 与 manifest 路径。

选择显式 manifest，而不是依赖临时目录约定，是为了让测试、artifact upload、registry 核对和失败诊断使用同一 closed identity。

### 2. 发布前 smoke 复用现有安装后生命周期

现有 release smoke 增加显式 package source 模式：本地 artifact 模式接收 tarball 与 manifest，registry 模式接收 `@buildr-ai/buildr@<exact-version>`。两种模式共享安装后 `init`、`sync`、`doctor`、optional Component uninstall 和最终 doctor 断言，但使用彼此隔离的 prefix、Workspace 与 App Data。

不另写一套简化 smoke，避免两个测试对公开生命周期形成不同断言。

### 3. `npm publish` 直接发布已验证 tarball

workflow 使用 `npm publish "<tarball>" --access public --tag <tag>`。保留 npm 11.5.1、GitHub-hosted runner、`id-token: write`、`npm-production` Environment 和无 `NODE_AUTH_TOKEN` 设计，使 trusted publishing 与自动 provenance 继续成立。

### 4. Registry 恢复先比较 integrity

registry state reader 返回目标版本是否存在及 `dist.integrity`。不存在时允许 publish；存在时必须与本次 manifest 的 SHA-512 integrity 相同才可跳过。版本相同但 bytes 不同属于不可恢复冲突，workflow fail closed。

publish 后再次查询，确认版本存在、integrity 相同且目标 dist-tag 指向精确版本，再进入发布后 smoke。

### 5. GitHub Release 使用 ensure 语义

新增 release ensure 脚本或受测 shell 编排：不存在时创建；存在时核对 tag、target commit、body 与 prerelease/Latest 语义。内容不一致时 fail closed，不覆盖已有 Release。这样 workflow 在 npm publish 后中断时可以从同一 tag 安全重跑。

### 6. 不可逆步骤后的失败只恢复缺失事实

发布后 registry smoke 失败时 workflow 保持失败，但不得 unpublish、移动 tag 或重复 publish。下一次同一 tag run 通过 registry integrity 与 GitHub Release ensure 判断从哪里继续。

## Risks / Trade-offs

- [Risk] npm pack 在重跑时产生不同 bytes，导致已发布版本无法通过 integrity 恢复 → manifest 和 contract tests 固定打包输入；真实不一致 fail closed，不把 version 相同等同于 artifact 相同。
- [Risk] registry 刚写入后存在短暂可见性延迟 → 发布后 registry probe 使用有界重试；重试耗尽后保留已发布事实并失败。
- [Risk] 发布后 smoke 需要下载 Node runtime → 继续使用 workflow 准备的 runtime data 或明确有界网络超时，不共享 smoke 的可变 Workspace。
- [Risk] GitHub Release 已存在但正文错误 → 只核对并失败，不自动改写公开发布说明。
- [Trade-off] 上传 tarball artifact 会额外占用少量 CI 存储，但提供了可审计的 filename、digest 与 inventory 证据。

## Migration Plan

1. 先增加 artifact preparation、registry integrity、Release ensure 与双模式 smoke 的本地测试。
2. 修改 tag workflow，删除完整 Candidate，改为 pack-once、pre-publish smoke、registry gate、publish tarball、Release ensure、post-publish registry smoke。
3. 更新发布 checklist 与 `buildr-release` Skill，明确不可逆步骤后的恢复语义。
4. 在不创建 tag 的情况下运行 workflow contract、release focused 和 affected verification。
5. 下一次候选 tag 首次使用新流程；失败恢复始终保留 tag/npm/Release 已完成事实。

## Open Questions

无。
