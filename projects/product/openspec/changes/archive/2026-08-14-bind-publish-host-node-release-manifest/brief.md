# 发布 Host Node 绑定冻结 manifest

## 一句话摘要

让 tag publish 的 Host Node verifier 与 Candidate CI 一样显式消费冻结 tarball、pack metadata 和 release artifact manifest，避免发布门禁因输入契约漂移而确定性失败。

## 背景与问题

`v0.1.0-rc.10` 的发布 workflow 已补齐独立 runner 的 `npm ci`，但 Host Node step 没有设置 `BUILDR_CANDIDATE_RELEASE_MANIFEST`。Verifier 能安装 tarball，却无法取得用于比较 `applicationPayloadDigest` 的 manifest；两个 Node tuple 因此在 npm 写入前失败。Candidate CI 的 adapter 自动注入三项输入，所以源码 Candidate 未暴露这个 tag-only wiring 缺口。

## 目标与非目标

- 目标：闭合 tag publish Host Node 的三项制品输入，并用 contract test 防止再次漂移。
- 目标：以新版本 rc.11 承载修复，保留 rc.10 tag 和失败事实。
- 非目标：不移动 tag、不本机发布、不改变 OIDC probe、一次 pack 或 dist-tag 规则。

## 受影响角色

- 发布维护者：tag workflow 在进入受保护 npm 写入前能可靠完成 Host Node 门禁。
- npm 使用者：正式版本继续由同一 manifest 绑定的不可变 tarball 提供。

## 核心流程

Artifact producer 冻结 application payload 和唯一 tarball后上传包含 tarball、`npm-pack.json`、`release-artifact.json` 的 candidate artifact。每个 Host Node runner 独立安装 checkout harness、下载 artifact、显式传入三项输入并验证 identity；全部可逆门禁通过后才允许 protected publish。

## 关键变化

- `publish.yml` Host Node verifier step 增加 `BUILDR_CANDIDATE_RELEASE_MANIFEST`。
- workflow contract test 将该 manifest 输入纳入闭合断言。
- rc.11 发布材料记录 rc.10 未进入 npm/GitHub Release。

## 影响、风险与兼容性

没有 npm package runtime 或公开 CLI 兼容性变化。主要风险是 workflow 与 Candidate adapter 再次漂移；由精确 job/step contract test 缓解。同一 rc.10 tag 不可恢复，必须使用 rc.11。

## 验收摘要

- focused contract test 对当前 workflow 通过，并能拒绝缺失 manifest 的 Host Node step。
- changed/affected 与本地完整 Candidate 通过。
- GitHub `Candidate gate` 在 rc.11 source SHA 上通过。
- 准备阶段完成 `post-main` 后停在 tag 前，不运行 authority probe。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/product-verification-quality/spec.md`
- `tasks.md`
