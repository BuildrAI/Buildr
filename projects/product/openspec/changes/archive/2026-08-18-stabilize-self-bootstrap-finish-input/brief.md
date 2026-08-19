# 稳定 Task Finish 自举输入契约

一句话摘要：Product CLI 把可演进的 Task Finish Result 归一化为稳定 self-bootstrap 输入，使 runner 不再随 v2、v3、v4 逐代升级。

## 背景与问题

Task Finish Result 从单仓库 v2 升级为多仓库 v3 后，self-bootstrap runner 仍直接解析 v2 和单 carrier 根路径，因此在任何 effect 前停止。若继续让 runner 逐个兼容内部 major，后续 repository、delivery 或 recovery 模型升级都会重复破坏跨模块调用。

## 目标与非目标

- 目标：由 Product CLI 独占内部 Result 到 `buildr.task-finish-self-bootstrap-input/v1` 的语义归一化。
- 目标：current/foreign inspect 与全部 same-run resume 使用同一稳定投影。
- 目标：支持 Workspace 与多个 Service repository，严格证明 run container、全部 carrier 与 resume identity。
- 非目标：不改变 Task Finish 五阶段、SQLite、compact/full Result、delivery 或 Environment cleanup。

## 核心流程

1. runner 通过 `task finish run|inspect --detail self-bootstrap` 取得稳定投影。
2. Product projector 从受支持的内部 Result major 生成唯一 Workspace repository、carrier container、repository carrier 集合、activation paths、refs 与 recovery facts。
3. runner 只用 Workspace repository paths 决定 sync、Buildr Web install 与入口验证；Service paths 不触发根自举。
4. runner 验证 current/foreign container 和全部 carrier 后执行既有 activation；Workspace 无贡献时直接 not-applicable，由 Finish cleanup 统一清理环境。

## 关键变化

- 新增稳定公开 schema 与 CLI detail，不修改 compact/full 默认语义。
- runner 删除 raw Task Finish Result major 分支。
- v2 同目录 carrier 与 v3 嵌套多 carrier 使用同一 ownership/path 规则。
- 内部 v4/v5 若不改变自举语义，只更新 Product projector；自举语义不兼容时才升级稳定投影 major。

## 影响、风险与兼容性

新 detail 是 additive。旧 runner 在激活前继续 fail closed；新 runner 对同 major additive 字段兼容，对未知稳定 major、Workspace identity 缺失、carrier 越界、symlink 或重复 realpath 保持零副作用停止。没有 SQLite migration，也不修改已有 run。

## 验收摘要

- v2/v3 归一化为同一稳定 schema，runner 不识别内部 Result identity。
- 多仓库只使用唯一 Workspace contribution，Workspace 无贡献时不激活。
- nested、escaped、duplicate 与 foreign carrier 均有确定性验证和 fail-closed 测试。
- inspect、resume、help、schema registry、checkout/package 验证保持一致。

## 技术入口

- `proposal.md`
- `design.md`
- `specs/public-json-contracts/spec.md`
- `specs/task-finish-execution/spec.md`
- `tasks.md`
