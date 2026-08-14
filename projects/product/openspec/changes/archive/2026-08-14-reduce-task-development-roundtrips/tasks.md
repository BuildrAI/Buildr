## 1. Task Development 输入与反馈

- [x] 1.1 让shared action contract与Application共同要求`begin|planning`显式提交完整planning snapshot，并覆盖零写入失败测试
- [x] 1.2 根据同次Application保存事实生成建议性next actions，增加opt-in compact driver projection及unit/integration/contract测试

## 2. OpenSpec semantic blocker

- [x] 2.1 在current与兼容性deterministic planner中返回确定的omitted Scenario identities，并覆盖blocked零写入与结果透传测试

## 3. 工作资产与验证

- [x] 3.1 同步Task Development Skill、`buildr.task-development@2` contract、Buildr Service当前知识和知识影响evidence
- [x] 3.2 运行OpenSpec strict validation与受影响Development tests，修复发现的问题并完成Change checklist
