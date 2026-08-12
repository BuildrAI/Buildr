## Context

现有Contribution引擎同时支持命名slot和`@append`。当前只有Buildr自举Workspace需要把维护说明接到`task-finish`末尾，目标Skill不需要为此公开通用slot。

## Goals / Non-Goals

**Goals:** 删除通用slot；保持自举行为与失败边界；验证普通Workspace无自举资产。

**Non-Goals:** 不修改Contribution引擎；不新增contract或hook；不改变Formal Finish Result、Candidate、Verification、Review或Environment cleanup。

## Decisions

### 1. Component使用`task-finish@append`

`buildr-self-bootstrap`继续拥有专属Skill和fragment，但声明改为`task-finish@append=...`。Contribution内容自身承担“Formal成功后、最终完整报告前”顺序说明。

### 2. 通用Skill不知道自举扩展

package中的`task-finish`删除slot和Workspace维护小节。普通Workspace渲染后的Skill不含自举术语或扩展标记。

### 3. 结果边界不变

自举Skill仍只消费成功Formal Result和固定inputs；失败只影响Workspace convergence报告，不改写上游事实。

## Risks / Trade-offs

- `@append`没有命名位置。当前片段独立且只要求位于Skill末尾，正好满足需求；未来若出现强类型结果依赖再单独评估contract。

## Migration Plan

修改package Skill，candidate-local sync刷新Workspace源；更新Component declaration与integrity；重新安装/render并验证；收敛Change。

## Open Questions

无。
