# OpenSpec语义就绪预检

## 一句话摘要

在Planning Review前，用Buildr现有确定性收敛规则只读检查Change是否能正确合入当前canonical specs，提前暴露Scenario遗漏、identity/rename歧义和active Change冲突。

## 背景与问题

`openspec validate --strict`只能证明Change文档格式和结构合法，不能判断完整`MODIFIED`是否漏掉既有Scenario、rename目标是否冲突，也不能判断其他active Change是否同时修改相同Requirement。这些问题目前往往到最终`converge`才出现，导致计划已审或实现已完成后返工。

## 目标与非目标

目标是在OpenSpec Contract Guard中增加无副作用的semantic readiness preflight，复用最终convergence planner与projected strict validation，并给Agent稳定、可处理的阻断分类。它不属于Planning Review，不修改Review Result；不写canonical、Receipt或archive；也不替代最终converge和实现验证。

## 核心流程

Change artifacts达到apply-ready并通过上游strict后，Contract Guard运行preflight。结果为`ready`时继续planning identity和Planning Review；结果为`blocked`时，Agent根据active Change conflict、Scenario omission、identity/rename conflict或projected validation诊断修订语义或处理依赖，再重新检查。

即使preflight曾经ready，只要dev合入、canonical、delta、active Change或executable变化，该结果就会陈旧。最终`converge`始终重新读取最新事实、重新规划和验证，不消费旧ready作为写入授权。

## 关键边界

- 检查逻辑归OpenSpec Contract Guard和deterministic convergence planner所有。
- Agent只处理blocked暴露的语义决定，不手工伪造ready或修改canonical绕过。
- Planning Review只消费ready后的原planning target，不拥有或复制OpenSpec检查。
- Convergence Inspect仍只用于已有Receipt的事务恢复，不用于开发前预检。

## 验收摘要

- ready、Scenario omission、identity/rename、active Change conflict和projected validation均有确定性结果与测试。
- CLI输出绑定delta、canonical、active Changes、executable和algorithm identity，且`effects`为空。
- preflight后事实变化会产生不同readiness或状态。
- 最终converge不读取preflight结果并按最新事实重新检查。

## 技术Artifacts入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
