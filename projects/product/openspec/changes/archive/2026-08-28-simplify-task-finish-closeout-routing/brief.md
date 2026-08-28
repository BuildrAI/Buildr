# 统一收尾与交付入口

## 摘要

用户表达“收尾”或“交付”后，由同一个 `task-finish` Skill判断当前范围是否存在匹配的未结束Buildr Task，并把工作持续推进到可证明的交付和安全善后终点。

## 背景与问题

Buildr已有正式Task Finish和无Task直接Git收尾两条正确的底层路径，但入口分散：`task-finish`只声明已有正式Task，产品入口Buildr Skill另外解释无TaskGit收尾。用户和Agent需要在加载技能前理解内部Task状态，容易误路由或提前停止。

## 目标

- 一个面向用户的“收尾/交付”入口。
- 有匹配Task时按current `task next`渐进调用专业owner，直到正式Finish和善后完成。
- 无匹配Task时完成普通Git交付与可证明归属的本地清理。
- 保持Formal Task evidence与Git Operation Result相互独立。
- 以中文行为描述为主，压缩重复和实现细节。

## 非目标

- 不合并Task Finish Application与Git Operations。
- 不改变Candidate、Verification、Review、Environment或Task Record authority。
- 不增加force push、共享历史改写、丢弃内容或不明资源删除授权。

## 核心流程

1. 识别当前repository set、scope与匹配的未结束Task。
2. 唯一匹配Task时，消费`task next`并把当前动作交给selected owner；到达current handoff后执行Formal Finish。
3. 无匹配Task时，选择独立Git Operations完成精确commit、目标收敛、普通push、远端回读和安全善后。
4. 多个匹配Task、目标不明确、语义冲突或破坏性动作需要新授权时停止并请求最少决定。

## 关键变化

- `task-finish` description覆盖完整“收尾/交付”意图。
- Skill正文形成“判断事实 → Task分支 / Git分支 → 完成标准”的短结构。
- 产品入口不再维护另一份无Task收尾手册，只保留统一入口说明。
- 随包验证覆盖两条分支、依赖按需提升和evidence隔离。

## 影响、风险与兼容性

- `buildr.task-finish/v1`正式保证保持兼容。
- `buildr.git-operations/v1`继续只执行caller已选择的一次operation。
- 主要风险是无关Task劫持、路由循环和清理越界；分别通过matching scope、`task next`状态变化和ownership proof关闭。

## 验收摘要

- 用户只说“收尾”或“交付”即可命中统一Skill。
- 有匹配Task时不会降级为普通Git，也不会越过专业owner。
- 无匹配Task时不会创建或修改Formal Task evidence。
- 两条路径均推进到远端回读及适用善后，真实blocker除外。
- source、package和runtime中的Skill内容与description一致。

## 技术入口

- [提案](proposal.md)
- [设计](design.md)
- [实现任务](tasks.md)
- [Agent Task Workflows delta](specs/agent-task-workflows/spec.md)
- [Direct Git Closeout delta](specs/direct-git-closeout/spec.md)
- [Buildr Package Assets delta](specs/buildr-package-assets/spec.md)
