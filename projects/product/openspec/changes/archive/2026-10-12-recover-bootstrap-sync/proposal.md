## Why

本次技能（Skill）同步已经成功，但唯一自举执行器在暂存同步产物时遇到瞬时 Git 锁，留下已知文件后退出。现有入口只支持已提交后继的恢复，无法安全接续这些未提交产物，阻碍用户已授权的技能（Skill）生效；无需改变外部接入设计即可修复。

## What Changes

- 为原执行器增加显式、临时的同步恢复输入，绑定原交付参数、当前提交以及精确文件内容摘要。
- 只在当前路径、内容和 Git 身份均匹配时由同一执行器接续提交、推送及激活；普通未提交内容继续拒绝。
- 不新增持久状态库，不自动夺锁、丢弃内容或采纳未知改动；非破坏性扩展。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-closeout-orchestration`：补充同步已成功、尚未提交时的显式恢复边界。

## Impact

只影响工作空间（Workspace）自举技能（Skill）的唯一执行器、使用说明及现有集成测试；不改变发布包、外部系统或正式导航。任务背景见[任务说明](@task/progressive-feature-design)。
