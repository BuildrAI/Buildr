## Context

当前 release preparation 在 `dev → main` 收敛后执行一次 hosted OIDC authority probe，正式 release 又在 tag 前执行第二次。两次都绑定相同 `main` commit、`publish.yml` digest、package 与 `npm-production` Environment；短时间连续执行没有增加内容验证，只产生第二次人工审批和短时 evidence。

`publish.yml` 的 tag path 由多个隔离 job 组成。`candidate` job 安装依赖并构建唯一正式 tarball，但后续 `host-node` job 在新 runner 上只下载 tarball，不拥有前一 job 的 `node_modules`。当前 Host Node harness 会加载 checkout 内的 verification registry 与 release helpers，其中 `runtime-role-verification.mjs` 直接依赖 `yaml`，因此两个 Linux tuple 都确定性失败。

失败的 `v0.1.0-rc.9` tag 已成为公开不可移动事实，但 npm version、dist-tag 与 GitHub Release 尚未写入。修复必须进入新 source commit 和新 prerelease，不能修改旧 tag。

## Goals / Non-Goals

**Goals:**

- 让每个 tag publish Host Node job 在独立 runner 上具备完整、lockfile-bound 的 checkout 验证依赖。
- 将 hosted OIDC probe 收敛为正式发布授权后的单次 pre-tag 门禁。
- 在 convergence CLI 中明确区分“候选已进入 main”和“已取得短时发布权威”两个阶段，避免可选参数弱化 tag 门禁。
- 用静态契约与集成测试阻止 workflow/Skill/checklist/current knowledge 再次漂移。
- 形成包含修复的 `0.1.0-rc.10` 候选，同时保留 rc.9 外部失败事实。

**Non-Goals:**

- 不删除、移动或复用 `v0.1.0-rc.9`。
- 不从本机执行 `npm publish`，不新增 token/OTP 回退。
- 不删除 tag workflow 对最终 tarball 的 Host Node 或 Launcher smoke。
- 不改变 npm `next`/`latest` 映射，也不在准备阶段创建 rc.10 tag。

## Decisions

### 1. 将 convergence 拆为 `post-main` 与 `pre-tag`

`post-main` 只证明 dev/main version、tree、ancestry、branch protection、release task ref 与远端竞争已经收敛，不接受也不要求 authority evidence。新 `pre-tag` stage 在相同 source gate 上额外强制读取未过期的 v2 authority evidence，并且只能在用户明确授权正式发布后调用。

相比让现有 `post-main` 的 evidence 变成可选参数，独立 stage 能让 CLI、Skill 和测试从名称上保持 fail-closed：任何创建 tag 的调用者都必须显式进入 `pre-tag`，不能把准备结果误当发布授权。

### 2. 准备阶段不运行真实 hosted probe

准备阶段继续验证 `publish.yml` 结构、唯一 authority tuple、Environment、OIDC permission 和 source convergence，但不 dispatch `workflow_dispatch`，也不请求 `npm-production` 人工审批。正式发布阶段在 tag 前运行一次 runner，生成 v2 evidence 后立即调用 `pre-tag`。

如果 evidence 在 tag push 前过期或发生 source/workflow/控制面漂移，本次发布尝试停止并重新取证；这属于旧 evidence 已失效后的恢复，不是准备/发布双阶段重复。

### 3. Host Node job 自行执行 locked install

每个 tag `host-node` matrix job在 `actions/setup-node` 后执行 `npm ci`，再下载并验证同一冻结 tarball。依赖只服务于 checkout verification harness；被验证的产品仍来自 tarball，`npm ci` 不改变或重建 tarball。

相比把 `node_modules` 从 candidate job 上传为 artifact，独立 `npm ci` 保持平台/Node ABI 正确、减少超大可执行依赖制品，并沿用 PR Candidate Host Node 已验证的隔离模型。

### 4. 契约测试同时约束顺序和职责

测试必须证明：Host Node job存在 `npm ci` 且位于 checkout/setup-node 后、harness 前；authority probe 只在正式 release Skill 的 pre-tag 路径出现一次；preparation 文本与 checklist 不再要求 hosted exchange；`pre-tag` 缺失、过期或漂移 evidence 时失败。

## Risks / Trade-offs

- [每个 Host Node tuple 增加 install 时间] → 依赖规模小且使用 lockfile；正确的隔离 runner 依赖优先于跨 job 复用 `node_modules`。
- [新增 convergence stage 造成旧 consumer 漂移] → 同步修改 Skill、checklist、current knowledge、CLI tests 与所有脚本调用，并通过全文契约搜索拒绝旧准备阶段 probe 文案。
- [准备阶段不再提前发现 OIDC 控制面故障] → 保留 workflow structure 静态检查；真正控制面只在用户授权发布后探测，失败仍发生在 tag 前且无公开副作用。
- [rc.9 留下 tag 但没有 package] → 明确记录为失败且不可移动的 prerelease 尝试；rc.10 使用全新版本与 tag，避免覆盖历史。

## Migration Plan

1. 更新 spec、Skill、convergence CLI、workflow 与测试。
2. 完成 Change 严格验证、current knowledge 收敛、正式 Task Verification 与 Finish，将修复交付到 `dev`。
3. 从修复后的最新 `dev` 完成 rc.10 版本与发布材料，进入 `main` 并通过分布式 Candidate gate。
4. bridge `main → dev` 后只运行 `post-main` source convergence，报告候选准备完成并停在 tag 前。
5. 后续获得独立“发布 rc.10”授权时，执行唯一 hosted probe、`pre-tag` convergence、tag workflow 与公开回读。

回滚仅适用于 tag 前的未发布候选：修复代码可由后续独立 change/revert 处理；不得删除或移动已公开的 rc.9 tag。

## Open Questions

无。
