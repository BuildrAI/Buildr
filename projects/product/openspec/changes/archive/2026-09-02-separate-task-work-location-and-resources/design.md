## Context

当前 Task Environment 同时拥有 Git Worktree、Project Preparation、Node/CLI、runtime projection、Preview resource 与总 cleanup。实际消费者已经大幅收缩：Task Verification、Task Review、Current Knowledge 与默认 Task Finish可以独立工作；Worktree已有窄provider和公共CLI，Preview也已有实例owner、PID、secret与健康探测。继续让这些能力经过统一Environment，只会把可重新观察的局部事实聚合成新的许可和恢复负担。

本Change是最终删除Environment前的消费者迁移。Release仍依赖Environment的精确准备与执行绑定，留给独立后续Change；Environment Application、Receipt、Plan、Web页签和数据也暂不在本Change删除。

## Goals / Non-Goals

**Goals:**

- 普通任务、OpenSpec、Review、Verification与Finish可以直接使用当前Workspace或明确Worktree，不需要Environment记录。
- Worktree provider独立保护多仓创建、实时检查和精确清理。
- Preview Application独立拥有进程、端口、secret、Task/Workspace/Worktree身份和停止安全。
- Task-scoped Change从Worktree evidence定位候选根，没有Worktree时读取retained Project根。
- 受影响的保留实现、接口、fixture与测试迁到TypeScript。

**Non-Goals:**

- 本Change不删除Environment Application、SQLite数据、Preparation Declaration或Environment Web页签。
- 不改变Release选择、Candidate、受保护发布事务或closeout流程。
- 不创建工作位置、项目准备或通用资源的新Application。
- 不让Worktree provider判断任务是否完成、业务成果是否交付或Preview进程状态。

## Decisions

### 1. Agent选择工作位置，不保存统一工作位置current

普通工作直接使用已核对的当前checkout；需要隔离时，Agent显式调用`worktree create`并使用其返回的checkout path。OpenSpec、Review、Verification与Finish只消费真实对象和具体owner，不要求任何统一`ready`。

不新增Work Location Application。当前目录、Project/Service根可以从文件系统和registries重新观察；独立Git位置已有Worktree evidence。

### 2. Worktree provider直接接收删除所需事实

`worktree cleanup`使用逐仓成对的完整`expected-source`和`delivered-ref`。调用方负责先核验完整交付；provider只复核evidence、source版本、dirty、registration、retained ref与删除前漂移。任务完成状态、目标提交存在或路径相似均不构成删除证明。

清理输入normalizer从Task Environment Domain迁到Worktree Domain，使provider不再反向依赖Environment。旧`--integrated-ref`不保留长期转发。

### 3. Preview owner直接绑定Worktree

Task Preview启动时读取matching Worktree evidence，选择实际Buildr Product checkout和candidate CLI。Preview store保存Task、canonical Workspace、worktree evidence identity、repository/branch/HEAD、实例、PID、URL和secret。Stop再次读取当前owner、实例健康和Worktree evidence，只停止完全匹配的实例。

Preview不再调用Environment resource register/release。启动失败或owner写入失败时仍由Preview立即回收刚创建的进程。

### 4. Task-scoped Change使用Worktree evidence作为候选位置来源

Change Application显式依赖Worktree provider read port。存在matching worktree时按Project registry的source path解析candidate root；不存在时使用retained Project root。它不从cwd、Task分支名、旧Receipt或相似路径猜测归属。

### 5. Environment保留为过渡遗留，不再是普通消费者依赖

本Change移除Triage、OpenSpec、Review和Finish的Environment capability bindings，Task Overview不再把Environment cleanup聚合成任务结果。Release和Environment专属UI暂时仍可读取原Application；后续两个Change完成Release迁移并删除本体。

### 6. TypeScript只迁移保留且修改的代码

Worktree provider/CLI/domain、Preview lifecycle/CLI、Change resolver、Overview/HTTP消费和相关测试迁到TypeScript。Environment专属实现和测试不迁移，等待最终直接删除。生成DTO继续由现有生成器产生。

## Risks / Trade-offs

- [Agent选择错误工作目录] → 写入前核对真实Git root、Project/Service registry和可选Worktree evidence；不从Task ID或cwd反推ownership。
- [调用方错误声称交付] → Worktree provider不判断业务等价，但必须保护完整source版本、dirty、retained ref和删除前漂移。
- [Preview owner与Worktree漂移] → start/stop/list返回精确owner，Task Preview停止前重验Task、Workspace、worktree evidence和进程secret。
- [过渡期Environment与新路径并存] → 只允许Release和Environment专属读取继续消费；普通Skills与Change/Overview改走新路径，最终Change直接删除旧接口而非永久双路由。
- [TypeScript迁移扩大diff] → 只迁移实际保留且本Change修改的文件，删除代码不改扩展名。

## Migration Plan

1. 先建立Worktree direct cleanup的TypeScript domain/CLI与安全测试。
2. 迁移Task-scoped Change和Preview到Worktree/Preview owner，验证无Environment记录场景。
3. 移除Triage、OpenSpec、Review、Finish bindings和Overview聚合。
4. 同步Skills、contracts、public JSON、Buildr Web类型与当前知识。
5. 运行strict/preflight、focused Unit/Integration/System、typecheck和受影响Browser任务场景。
6. 收敛并归档Change后交付本Task；Release与Environment删除由后续Task继续。

回滚时恢复消费者bindings和Preview Environment registration；已经存在的Worktree/Preview owner按各自evidence保留，不自动删除。

## Open Questions

无。用户已确认最终删除统一Environment以及不保留旧数据；本Change只完成第一阶段消费者迁移。
