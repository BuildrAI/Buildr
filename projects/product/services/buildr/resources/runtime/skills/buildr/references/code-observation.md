# 只读代码观察

人在“代码”区域与智能体（Agent）通过以下命令读取同一应用能力。先明确工作空间（Workspace），再使用登记代码库实例（Repository Instance）标识；不从目录、分支（Branch）或远端地址猜测归属。以下命令始终只读，不暂存、提交、抓取远端、切换分支（Branch）或修改任务（Task）。

## 查看清单和改动

```text
buildr code source-control --target <workspace> --json
buildr code source-control --task <task-id> --target <workspace> --json
```

普通入口返回全部登记实例，每个实例的 `worktrees` 根据Git实际清单列出主目录及所有关联工作树（Worktree），包括未登记为Buildr任务的位置。同一实例由多个服务引用时只列一次。任务参数只通过已确认服务范围与工作树证据提供 `selectedWorktrees` 预选配对，不缩减全部清单、不改变原任务查看。逐项检查工作树的 `worktreeId`、`source`、`observedRevision`、`status`、`fileCount` 和 `diagnostics`；领先／落后空值表示未确定，不能当作已同步。库级计数保留不同工作树的同名文件，不能跨来源按路径去重。实例、工作树状态及路径元信息有界读取，未读来源和覆盖数量明确保留。

同名工作树可跨代码库组织查看范围；网页名称过滤与代码库筛选联合，清除后恢复全部来源。智能体（Agent）也可根据清单的实际名称选出多组 `{repositoryId, worktreeId}`，再逐组读取。名称聚合不是任务关联权威，不能从名称、分支或路径猜测任务编号。

更改的 `area` 区分 `staged`、`unstaged` 和 `untracked`，同一路径可在两个比较层分别出现。用相同的库、工作树标识、路径与层读取差异（Diff）；已有 `scm:` 观察版本时传入它核对所选现场：

```text
buildr code diff --repository <id> --worktree <worktree-id> --path <relative-path> --area staged --expected-revision <scm-revision> --target <workspace> --json
buildr code source-file --repository <id> --worktree <worktree-id> --path <relative-path> --area staged --expected-revision <scm-revision> --target <workspace> --json
```

暂存层比较上次提交（Commit）到索引（Index），未暂存层比较索引到磁盘，新文件比较空内容到当前内容。`source-file --area staged`读取真实索引对象；不能改用普通当前文件接口（API）冒充暂存内容。读取失败或版本变化后重新观察，不把旧差异和新全文拼成同一结果。

## 查看本机历史

```text
buildr code branches --repository <id> --worktree <worktree-id> --target <workspace> --json
buildr code authors --repository <id> --worktree <worktree-id> --branch refs/remotes/origin/main --target <workspace> --json
buildr code history --repository <id> --worktree <worktree-id> --branch refs/remotes/origin/main --author-email <email> --query <text> --limit 200 --target <workspace> --json
buildr code commit --repository <id> --worktree <worktree-id> --commit <full-sha> --target <workspace> --json
buildr code diff --repository <id> --worktree <worktree-id> --commit <full-sha> --path <relative-path> --area commit --target <workspace> --json
buildr code source-file --repository <id> --worktree <worktree-id> --commit <full-sha> --path <relative-path> --area commit --target <workspace> --json
```

历史读取本机可达记录，包括尚未推送的提交，不抓取远端。首版每次检查最近2000条，默认每页200条，`limit`为1–200；关键词只覆盖实际检查范围。分支筛选按可达关系读取，引用标记只说明哪些分支或标签当前指向该提交。查看 `coverage`及`nextCursor`，超限不得声称覆盖全部历史。根提交没有父提交，合并提交首版以第一父提交作为差异基线。

`branches` 最多返回1000个本地、远程记录，完整 `ref` 区分同名来源；`localBranch` 只表示所选远程项对应的已确认本地跟踪关系，不能凭名称自行归并。`worktreeId/worktreeLocation` 表达真实占用。历史范围兼容本地名称，也接受完整 `refs/heads/…`、`refs/remotes/…`；不指定或 `HEAD` 随当前位置变化。`authors` 独立观察所选可达范围内的作者（Author），按邮箱区分同名人员，不使用一页历史推断全量候选；其2000条扫描及8 MiB对象上限和截断须检查。`--author-email` 精确匹配邮箱，和关键词组合后才分页；改变范围或条件后重新从首页观察，不复用旧游标（Cursor）。

`authors.currentAuthor` 独立表示具体工作位置的有效已配置作者（Author）身份：非空 `author.email`、`author.name` 优先，否则使用 `user.email`、`user.name`，Git 工作树（Worktree）独立配置及条件包含均按该目录生效。姓名可空，邮箱未配置、无效或暂不可确认时返回 `null`；不得使用登录用户、系统名称或 `EMAIL` 等环境值猜测。“我的提交（me）”按该明确邮箱筛选，即使它尚未出现在已扫描候选中也可选择；无确认邮箱时仅禁用此快捷项，不阻止其他候选。该身份纳入作者（Author）观察版本，配置变化后重读，不沿用旧身份观察。网页姓名或邮箱输入仅搜索候选，实际仍按准确邮箱读取历史。

网页工作位置旁的管理入口与历史过滤分别提供实际切换和只读查看。实际切换使用独立 `POST /code/branch-switch`，绑定已观察位置版本、完整目标引用（Ref）及提交（Commit），并由本机会话（Session）授权；它不作为上述只读命令或工作进程（Worker）动作开放。远程独有项会建立对应本地跟踪分支（Tracking Branch）并检出（Checkout）；已跟踪本地项使用自身成果，不重置到远程。占用、覆盖现有或被忽略文件的风险、版本变化时保留现场；不自动执行钩子（Hook）或外部文件转换，需要外部转换的相关切换局部拒绝，不能关闭转换后把错误内容当正常文件。失败结果包含可确认的当前事实及已发生效果；未知结果不能解释成没有变化。智能体（Agent）需要执行 Git 变更时，仍使用当前工作空间（Workspace）绑定的 Git 操作能力并核对用户目标、对象和副作用。

关联任务只接受服务确认的有效唯一 `Buildr-Task` 尾注（Trailer）及可读取任务；正文示例、冲突、无效编号或缺失任务不形成可用关联。任务内“改动与提交”继续保留原查看，与全局源代码管理仅通过准确来源及返回入口双向关联，不复制或替代详情。

## 工作树来源与当前文件

`--worktree` 只能使用清单实际返回的不透明标识，与资源管理器的 `checkoutId` 共享检出身份；目录、文件及搜索优先使用 `--checkout` 传递同一值。服务端每次重新枚举所属代码库的Git工作树、核对公共目录与登记身份；目录重用、工作树移除、伪造标识和任意绝对路径均不能绕过来源选择。标识不等于分支名，也不授权创建、删除或切换工作树。

```text
buildr code directory --repository <id> --checkout <worktree-id> --path <relative-directory> --target <workspace> --json
buildr code file --repository <id> --checkout <worktree-id> --path <relative-file> --target <workspace> --json
buildr code search --repository <id> --checkout <worktree-id> --query <text> --target <workspace> --json
```

网页“查看当前文件”将所选 `worktreeId` 显式作为 `checkoutId` 传给资源管理器，不能回退到登记默认目录。缓存与续读同时区分代码库、工作树、相对路径、比较层及版本。一个来源读取失败不清空其他来源，刷新失败保留已读取内容并提示错误。资源管理器的普通固定历史读取不依赖原工作树仍存在；源代码管理显式选择工作树时继续核对该来源，两种读取边界分别保持。

## 全文与续读

首次全文请求不传 `page`；历史直接提供完整提交标识，不把提交级版本当作文件级版本。正文返回自己的 `revision`：当前文件、固定历史对象和索引对象分别区分。大文件继续读取时，传已观察文件的 `revision`及0起始 `page`，保持同一版本；需要新现场时重新从首次读取取得版本。

普通文本5 MiB以内完整读取，更大文本按约512 KiB分段，图片上限8 MiB；差异最多5000行或8 MiB。检查真实大小、截断、二进制说明和局部诊断，不把未读内容称为完整文件。命令与网页均拒绝未登记实例、越界路径、越界符号链接（Symbolic Link）、Git管理目录及冲突的版本／比较层输入。
