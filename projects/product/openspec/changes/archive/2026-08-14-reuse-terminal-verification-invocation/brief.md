# 避免重复执行同一正式验证

## 一句话摘要

同一 Formal Verification invocation 已有 active 或 terminal Execution Record 时默认回读既有事实，只有显式 `--retry` 才执行新的同组 run。

## 背景与问题

当前产品只拦截相同 active invocation。只要前一次已经进入 `passed`、`failed`、`blocked`、`cancelled` 等 terminal outcome，Agent 再次调用同一命令就可能重复昂贵验证并创建新历史；CLI/Skill 却把 `--retry` 表达为创建独立重试的唯一入口。

## 核心语义

1. exact identity 有 active record：返回 latest active，零执行。
2. 没有 active 但有 terminal record：返回 latest terminal outcome/lifecycle，零执行。
3. 显式 `--retry`：新建独立 run/record，旧记录不变。
4. target、declaration、capability set 等 identity 输入变化：按首次执行处理。
5. latest 固定使用 `opened_at DESC, record_id DESC`，active 优先于 terminal。

## Authority 边界

Execution Record 继续保存执行证据与历史；Task Verification Application 的 current Verification Result 继续是 Task Development 消费的正式结论。terminal 复用只返回非执行 execution envelope，不写 Result，不用 CLI 输出、内存状态或 Agent 推理替代 repository authority。

## 兼容与范围

不改变 schema、不迁移旧 row、不删除历史、不增加 retry 父子字段。`cleaned` tombstone 在 row 存在时可复用；被现有 GC 合法 purge 后，authority 中已无该 record，本 Change 不建立永久幂等表。

## 验收摘要

- active/terminal 默认重复调用均无新 record、resource、process、target observation 或 transient evidence。
- `passed|failed|blocked|cancelled` outcome 与 `retained|cleanup_pending|cleaned|attention` lifecycle 全覆盖。
- 显式 retry 与 identity 变化保持现有创建语义。
- 多历史 record 在相同时间戳下也能稳定选择。
