## 1. CLI 与帮助

- [x] 1.1 让 `task environment prepare` 解析把 `--agent` 当作必填；省略时 syntax 失败、非零退出、零写入，usage 不再把 `--agent` 写成可选
- [x] 1.2 更新 command registry 帮助、CLI Reference 与 syntax 文案，明确必须写出当前宿主

## 2. Application

- [x] 2.1 首次 prepare 缺少 adapter 时 fail closed，删除 `options.adapter || 'codex'` 与 manager 断言中的 Codex 默认值
- [x] 2.2 未给 `--branch` 时默认任务分支改为 `${adapter}/${taskId}`；显式 `--branch` 优先，恢复仍匹配已保存 Git evidence

## 3. Skill 与调用面

- [x] 3.1 更新 `task-environment` Skill 源，使 prepare 示例包含必填 `--agent <adapter>`，并禁止省略后默认 Codex 的说法

## 4. 测试、知识与 archive 准备

- [x] 4.1 覆盖省略 `--agent` 失败、Cursor/Codex 显式宿主登记、默认分支跟随 adapter、显式 `--branch` 优先与恢复 mismatch
- [x] 4.2 修正既有省略 `--agent` 或断言硬编码 `codex/<task-id>` 默认前缀的测试与夹具
- [x] 4.3 刷新 Brief，评估并收敛受影响 current knowledge（Buildr Service 说明与技术架构中 prepare 宿主要求）
- [x] 4.4 运行 `openspec validate --strict` 与 convergence preflight，修复本 Change 引入的问题，确认具备 deterministic convergence/archive 条件
