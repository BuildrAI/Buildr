## Why

Agent并发交付越来越快后，人的注意力成为复盘查看与决策的真实瓶颈；Buildr需要保留“哪份本地复盘仍待人决定”的可接续事实。当前独立Task Retrospective Application却同时保存长Markdown、三态处置、批量队列和专用后续关系，复杂度远超这一目标。

## What Changes

- **BREAKING** 删除独立Task Retrospective Domain、Application、Repository、内部Driver、HTTP、公共JSON、能力契约和绑定；不保留兼容转发。
- **BREAKING** 通过连续SQLite migration直接删除`task_retrospective_current`与`task_retrospective_sources`及其全部旧数据，不导出、不迁移、不双读。
- 用户明确要求复盘时，Agent基于当前可见事实生成自由Markdown到固定本机路径`.buildr/local/task-retrospectives/<task-id>.md`；正文不进入SQLite、Git、发布物或当前认知。
- Task Record只保存固定派生文档的内容摘要与`pending-decision | decided`状态；没有复盘时保持`null`，不表示失败或待办。
- 文档写入或变化后进入`pending-decision`；只有用户明确完成判断后才进入`decided`。状态不表达改进已实施，也不影响Task、Review、Verification、Git、交付或其他专业结果。
- Buildr Web在Task概览中读取固定本地文档并展示决策状态；查看零写入，Task列表直接按Task Record状态过滤。
- 删除`pending | handled | no-action`、处置说明与时间、`currentDigest`、批量`list`、字节预算、正文截断、自动复盘提示和`retrospectiveSourceTaskIds`。后续行动只复用或创建普通Task，并在目标中按需引用来源Task或复盘文档。
- 保留并重写`task-retrospective` Skill，使Agent负责事实调查、报告生成、缺失数据说明和授权后的普通Task承接，不再提供专用能力。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-retrospectives`: 从独立SQLite专业模块收窄为Agent生成本机Markdown、Task Record保存最小决策状态和Buildr Web只读查看。
- `task-record`: 删除复盘来源关系，新增固定本地复盘文档摘要与决策状态及其受控更新和查询。
- `task-overview-query`: 删除复盘来源投影，改为展示Task Record拥有的本地复盘文档摘要。
- `agent-task-workflows`: 删除终态自动复盘提示与内部Driver调用，保留用户明确要求后的Agent直接复盘。
- `product-agent-skills`: 让`task-retrospective`成为不提供独立Application能力的纯Skill。
- `buildr-package-assets`: 退役复盘能力契约、绑定、内部路由和运行实现，继续投射精简Skill。
- `task-retrospective-module-architecture`: 退役独立Task Retrospective模块及其技术分层。
- `product-verification-quality`: 删除只为旧复盘模块和内部Driver存在而维护的验证所有权。
- `openspec-upgrade-integration`: 从升级后必须保持有效的能力清单中移除独立Task Retrospective能力。
- `cli-product-surface`: Task CLI删除复盘来源参数，改为登记或清除本机文档摘要。
- `buildr-web-client`: 删除复盘来源/承接展示，新增概览卡片的只读文档与明确决定交互。
- `buildr-web-workspace-application`: Task页面删除独立复盘Application依赖和一级Tab。
- `task-professional-http-contracts`: 专业HTTP移除Retrospective操作，文档读取归Task Record contract。
- `open-source-release-governance`: Release transaction不再关联或读取复盘来源。

## Impact

- Task Record closed schema、SQLite migration、CLI、HTTP、Task查询与Buildr Web任务概览。
- Buildr Service的Task模块、Bootstrap、内部路由、Doctor、包静态检查、能力清单和测试。
- Buildr Web的Task详情、列表过滤、本地Markdown读取与生成DTO。
- `task-retrospective`、`task-manager`等随包Skills及相关Current Knowledge和产品说明。
- 保留和修改的人工源码、测试、fixture、helper、接口与DTO使用严格TypeScript；确定退役的JavaScript和专属测试直接删除。
