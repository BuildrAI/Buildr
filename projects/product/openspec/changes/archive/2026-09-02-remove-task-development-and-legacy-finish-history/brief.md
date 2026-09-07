# 删除任务研发与旧收尾历史

## 一句话摘要

Buildr删除已经没有真实消费者的任务研发、任务规划身份和旧收尾历史，让Agent直接围绕任务目标、真实产物和各专业结果工作。

## 背景与问题

Task Development仍复制Task Record、OpenSpec、文件内容和Current Knowledge，并维护Task Candidate、generation、统一`proceed|blocked`与Development Handoff。Review、Verification、Parent、默认Finish和任务完成已经独立，剩余链路只增加调用和陈旧状态。旧五阶段Task Finish也不再执行，只剩历史读取和本地数据库数据。

## 目标与非目标

目标是整体删除两个研发模块、旧Finish/Terminal Delivery集群、相关接口/UI/能力绑定及两张SQLite表；保留的Task、OpenSpec、Review、Verification、Environment、Current Knowledge和默认收尾独立工作。历史数据不保留、不迁移、不建立兼容层。

不重新设计Product/Release Candidate，不改变release source、generation、CI、唯一tarball、tag、npm或publication transaction。

## 受影响用户

- Agent不再维护研发回执、候选、统一决定或交接，直接使用真实工具和专业Skill。
- Buildr Web用户不再看到“研发”页签和旧机器交付历史，只看到Task结果、Change、证据、复盘和环境。
- 发布维护者继续使用原Product Candidate流程，Task correlation不再包含Development/legacy Finish字段。

## 核心流程

普通任务由Agent读取Task与现场，按需修改、审查、验证、交付、登记结果并清理环境。OpenSpec任务保留Task/Environment、strict validation、semantic preflight、apply、Current Knowledge和convergence；不再调用Development或Planning Identity。内容变化后由Agent根据真实subject/content identity决定重做哪些检查。

## 关键变化

- 删除`buildr.task-development`、`task-planning-identity`、旧Task Finish/Terminal Delivery代码和入口。
- 删除`task_development_current`、`task_finish_current`全部数据。
- 删除Development/Finish Web、HTTP、CLI、JSON、package和runtime surface。
- 直接重写的Task Overview、Repository、HTTP契约和Web接口使用严格TypeScript单一人工源码；退役代码与专属测试直接删除。现有共享MJS验证基础只解除旧依赖，不用仅改扩展名伪装迁移。
- 更新Current Knowledge、术语与路线图，Task Candidate退役，Product Candidate保持发布专用含义。

## 影响、风险与兼容性

这是破坏性变更。旧内部route、HTTP、CLI和Skill直接不可用；旧研发与机器交付历史永久丢失。Task Record结果不受影响。任何旧自动化必须改为调用实际专业接口。发布候选通过独立回归防止误改。

## 验收摘要

fresh与现有SQLite升级后不再有两张表；无Development/Finish情况下Task、OpenSpec、Review、Verification、Environment、Web和默认收尾正常；退役入口不可达且零写入；TypeScript、Buildr测试、Browser、package/npm及Product Candidate回归通过。

## 技术入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Specifications](specs/)
- [Tasks](tasks.md)
