## Context

发布 artifact producer 已把 tarball、`npm-pack.json` 和 `release-artifact.json` 放入同一个冻结 artifact。Candidate CI 通过 `artifactEnvironment()` 把三者映射为 `BUILDR_CANDIDATE_TARBALL`、`BUILDR_CANDIDATE_PACK_METADATA` 和 `BUILDR_CANDIDATE_RELEASE_MANIFEST`；tag publish Host Node job 则直接调用 `test/verification/host-node.mjs`，当前只设置前两个变量。`readSharedCandidatePackage()` 在缺少 manifest 时仍可返回 tarball/metadata，但 downstream identity 断言需要 `shared.manifest`，因此两个 Host Node tuple 确定性失败。

## Goals / Non-Goals

**Goals:**

- 让 tag publish Host Node job 与 Candidate adapter 使用相同的三项冻结制品输入。
- 在 workflow contract test 中把 manifest 路径和 verifier 前置顺序设为可执行断言。
- 保持一次 pack、同一 artifact、OIDC probe、protected publish 与恢复契约不变。

**Non-Goals:**

- 不改变 `readSharedCandidatePackage()` 对仅 tarball/metadata 的其他调用兼容性。
- 不修改或移动 rc.10 tag，也不尝试恢复 rc.10 npm publication。
- 不新增 artifact、job、npm publish 路径或本机发布回退。

## Decisions

1. **在 workflow job 中显式设置 `BUILDR_CANDIDATE_RELEASE_MANIFEST`。** 路径固定为下载目录中的 `${RUNNER_TEMP}/candidate/npm/release-artifact.json`，与 tarball 和 metadata 同属 candidate artifact。相比让 verifier 猜相邻文件，这保持输入显式并沿用 Candidate adapter 的公共环境契约。
2. **契约测试同时检查变量名、精确 manifest 文件和 verifier 前置关系。** 只验证 `npm ci` 顺序不足以证明完整 harness 输入；测试必须在删除变量或指向非冻结文件时失败。
3. **以 rc.11 承载修复。** rc.10 tag 已是不可逆公开 Git 事实，且 tag 内 workflow 确定性失败；新 RC 是唯一不移动 tag、不覆盖 npm version 的恢复方式。

## Risks / Trade-offs

- [Risk] workflow 字符串断言过于宽松，错误 job 也可能出现相同变量名 → 通过 YAML job 结构定位 `host-node` 的 verifier step，并检查该 step 的 `env` 或其 run block绑定精确 manifest 路径。
- [Risk] 仅修复 workflow，harness 以后新增必需输入再次漂移 → 契约测试把 shared candidate 的三项输入作为一个闭合集合断言。
- [Trade-off] 不强制 `readSharedCandidatePackage()` 全局要求 manifest，以免改变非 release 调用；正式 tag workflow 的强约束由 workflow contract owner 承担。

## Migration Plan

1. 在 rc.11 Task worktree 修复 workflow 和 contract test。
2. 运行 focused/changed/full Candidate（本次修改验证 owner 与 publish workflow，因此需要本地完整 Candidate）。
3. 完成 OpenSpec convergence、正式 Task Verification、Finish、自举验证与 GitHub Candidate gate。
4. rc.11 准备完成后停在 tag 前；后续正式发布重新生成唯一 authority evidence。

回滚仅通过后续 commit/release 修复，不移动 rc.10 或未来已推送 tag。

## Open Questions

无。
