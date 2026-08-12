# Proposal: 分离 Finish Doctor 与自举 runtime 激活

## Why

`move-buildr-installs-to-self-bootstrap-activation` 已把 development CLI 与产品 runtime 安装移到 Formal Finish 成功之后，但 Common Finish 仍以选中 Agent 模式运行 Doctor。任务自身修改 Product Skill 时，通用 render 不安装 Product Skill，选中 Agent Doctor 因而会把预期的 post-Finish drift 判为不 ready，使 Formal Finish 无法先成功，形成循环依赖。

## What Changes

- Common Finish 仍运行 retained Doctor 并严格要求 Workspace health ready，但使用通用 runtime inventory 模式。
- 选中 Agent Product Skill readiness 留给成功 Finish 后的 self-bootstrap activation 最终 Doctor 验证。
- 不跳过或放宽 Doctor 的 Workspace 错误，不提前执行 sync、CLI install、Product Skill install 或 Local App install。

## Scope

- Project: `product`
- Capability: `agent-task-workflows`
- Implementation: Task Finish Product executor、focused integration fixture、current knowledge与Task Finish contract说明。
