## Context
全部 webhook 由 Buildr 服务的统一队列序列化并发送，目前无顶层身份别名。

## Goals / Non-Goals
各类事件都有稳定身份；不把执行器、模型、账号或参与者误当成发送方，不新增配置与权限。

## Decisions
在唯一 enqueue 序列化出口加入 agent: {name: Buildr, id: buildr}，覆盖兼容和过程事件，并继续统一秘密替换。id 是生产者产品标识，不是任务或执行编号。

## Risks / Trade-offs
消费者需容忍新增字段；运行包采用前仅候选测试事件含此字段。HTTP 成功不证明下游例行任务完成处理，需接收端回执或查询证据。
