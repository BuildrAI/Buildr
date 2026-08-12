---
name: buildr-self-bootstrap-sync
description: Buildr自举Workspace的Formal Task Finish成功或只被retained Doctor阻塞后使用；按冻结Task Contribution去重执行package sync、development CLI、development Local App，验证默认CLI identity，并以最终Doctor或same-run resume收敛。
---

# Buildr Self-bootstrap Activation

本Skill只属于Buildr自举Workspace。它是`buildr-self-bootstrap` Component唯一的activation orchestrator，不是Finish provider、产品阶段或用户Workspace默认能力。它不创建receipt、数据库记录、事件或状态机，只使用当前会话中同一Formal Finish Result、产品resume事实与命令evidence。

## 输入与适用性

只消费当前`buildr.task-finish-result/v2`中的Task ID、run identity、Agent、canonical Workspace、remote/target branch、carrier/final或remote-after ref、Environment绑定的retained Node/CLI identity、Delivery Carrier内冻结Task Contribution paths，以及blocked路径的matching resume token。不得从HEAD、dirty tree、当前diff、时间或安装结果反推贡献。

Result必须恰好属于一种模式：

- `complete`：`status=complete`、五阶段完成且Environment cleanup成功；
- `doctor-blocked`：`status=blocked`、`primaryFailure.phase=deliver`、`operation=retained-doctor`、carrier/remote readback/partial delivery完整、`delivery.status=activation-blocked`、Environment尚未cleanup且`resume.phase=deliver`包含matching token。

`doctor-blocked`只有至少一个下述动作适用时才能覆盖普通停止规则。其他blocked/failed Result、并列failure、缺失partial delivery或无动作匹配一律返回`not-applicable`并保留原Finish结论。

按规范化Workspace相对路径形成封闭动作集合：

- `sync-retained-workspace`：`projects/product/services/buildr/package/manifest.yml`或`projects/product/services/buildr/package/targets/workspace/**`；
- `install-development-cli`：`projects/product/buildr`、`projects/product/services/buildr/bin/**`、`projects/product/services/buildr/src/**/*.mjs`、development launcher、CLI安装/卸载脚本、`package.json`或`package-lock.json`；
- `install-development-local-app`：`projects/product/services/buildr/src/interfaces/local-app/**`、`projects/product/services/buildr/src/interfaces/cli/launcher.mjs`、`projects/product/services/buildr/package/launchers/**`、`projects/product/services/buildr/package.json`、`projects/product/services/buildr/package-lock.json`或`projects/product/services/buildr/LICENSE`。该动作required依赖同一plan的`install-development-cli`；
- `verify-cli-identity`：任一前三项适用时，在安装动作后解析PATH实际命中的默认`buildr`，证明它绑定本次retained checkout并核对package/version；
- `finalize`：identity验证通过后，`complete`模式通过该默认入口执行一次指定Agent Doctor，`doctor-blocked`模式通过该默认入口恢复一次同一Finish run。

同一动作即使被多条路径命中也只执行一次。所有路径均未命中时返回`not-applicable`，不执行sync、Git、CLI install、Local App install、Doctor或Finish resume。

## 执行

正常路径只启动一次本Skill携带的runner；Agent不得再逐条编排sync、commit、push、安装、Doctor或same-run resume：

```bash
<receipt-node> skills/buildr-self-bootstrap-sync/scripts/closeout.mjs \
  --run <finish-run-id> \
  --target <canonical-workspace> \
  --node-executable <receipt-node>
```

Runner是本Skill的bundled script，只存在于Buildr自举Workspace，不进入Buildr用户npm package、`package/targets/**`或普通Workspace Skill集合。它通过retained `projects/product/buildr task finish inspect --run ... --detail full --json`从同一run只读取得Finish Result与`resolvedContext`，不导入Product内部Application模块；随后核对Component、模式、frozen paths、target branch、remote/final ref、clean tree和retained Node identity，形成确定性plan。然后按`preflight → plan → sync → commit → push → install-cli → install-local-app → verify-cli-identity → finalize`执行；每阶段独立返回`passed|blocked|not-applicable`、identity、最小operations与effects，不写新authority。

`verify-cli-identity`按当前PATH顺序解析实际可执行的`buildr`。其realpath必须是本次retained checkout的`scripts/run-development-cli`；launcher的runner-only inspection必须返回同一checkout的`bin/buildr.mjs`和Environment retained Node；随后由该默认入口执行`version --json`，package/version必须与retained `package.json`一致。PATH未命中、同名命令抢占、旧checkout symlink、launcher或CLI entry不匹配、Node不一致、版本不一致或命令启动失败一律fail closed，不进入`finalize`。

`doctor-blocked`模式下，尚未cleanup的当前Delivery Carrier是Finish owner的恢复资源，不属于用户dirty tree。Runner只在`workspaceRoot + runId`推导的路径与同一Result的`carrier.root`精确匹配、真实存在且不是symlink时，从untracked observation中排除该唯一root及其后代；该路径下的tracked/staged差异、其他untracked路径、root缺失或identity不匹配仍然fail closed。此规则不写`.gitignore`或`.git/info/exclude`。

`complete`模式的`finalize`只通过已验证默认入口运行一次指定Agent Doctor。`doctor-blocked`模式不另行运行第二个Doctor，而是由runner通过同一默认入口，使用原Task、run id和matching resume token恢复同一Formal Finish；恢复结果必须`status=complete`且cleanup完成。再次blocked时只消费runner返回的current resume事实，不重复启动本Skill或递归activation。

Runner结果是正常路径的唯一执行证据。需要诊断时只读其失败阶段、实际Git/ref/remote和产品Result；不得绕过runner独立补做阶段，除非用户基于这些精确事实重新授权人工恢复。

## 失败与恢复

- staged/未知delta、symlink逃逸、HEAD/remote漂移、非单一后继、run/plan trailer不匹配、installer identity不匹配、默认CLI入口链不匹配、package/version不一致或launcher channel/commit不匹配时fail closed。
- 不使用`git add -A`、force push或共享历史改写，不把sync delta混入原Task carrier。
- 失败时停止后续不安全动作，报告已完成动作、失败动作、冻结inputs、当前retained/remote/CLI/launcher identity与精确恢复入口。
- `complete`模式失败固定报告“主任务已交付、自举Workspace激活未完成”，不得重新运行Finish或改写已完成Result。
- `doctor-blocked`模式失败固定报告“Formal Finish仍被Doctor阻塞、自举恢复未完成”，保留Product返回的current run/resume事实；只允许上述一次same-run resume，不重跑Formal Verification、生成Candidate、执行Completion Review或改写Development handoff、decision、Task Record。
- activation evidence只存在于当前Agent执行报告；不得写入SQLite、Task Record、Development/Review/Verification、Finish JSON或新聚合store。

## 结果边界

成功消费`buildr.self-bootstrap-closeout-result/v1`并报告`passed`，包含输入模式、Formal Result/run identity、frozen paths、分类与plan identity，以及每个阶段的`passed|not-applicable`、sync commit/push/readback、PATH命中、launcher/CLI entry/Node、package/version和最终Doctor或same-run resume evidence。未命中报告`not-applicable`。该结果不是新的持久authority；`complete`模式不改变Task终态，`doctor-blocked`模式只有Product resume可以形成Formal Finish终态。Task Manager继续独立管理顶层完成状态。
