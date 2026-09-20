# 登记任务验证报告

### 先选择报告writer

项目检查的execution root与Task Verification Report的writer是两个独立事实。Task worktree可以运行真实检查并在操作系统临时目录形成portable report，但`task verification inspect|record`必须由canonical Workspace的合法installed或retained Buildr执行；`--target`只选择Workspace，不授予writer provenance。

- Buildr Product自举Workspace：当前execution root是与canonical Workspace共享Git common directory的linked Task worktree时，第一次`inspect`前直接选择`<canonical-workspace>/projects/product/buildr`，并用同一绝对入口完成`record`；不得先调用worktree内的candidate Buildr。
- 普通Workspace：使用该Workspace当前合法的installed或retained Buildr；不得假设存在`projects/product/buildr`。
- candidate writer被拒绝时保留零写入事实，切换到retained入口登记同一份report；不得绕过provenance、手写SQLite或仅为登记报告重新运行已经完成的测试。

## 构造写入输入

`--report` 文件只提交 `contentIdentity`、`contentSummary`、`checks`、`gaps`、`conclusion` 五个顶层字段。下面是最小完整结构示例：将 `demo`、`demo-unit` 替换为任务范围内的真实项目代码与该项目地图声明的测试族标识，其余字段也按真实已执行检查填写。`contentIdentity` 必须对应已核验内容版本，示例不能充当成功测试事实。

```json
{
  "contentIdentity": "<已核验的内容版本>",
  "contentSummary": "<内容范围及已有检查仍适用的依据>",
  "checks": [
    {
      "id": "unit-check",
      "project": "demo",
      "testing": "demo-unit",
      "selection": "focus",
      "targets": ["test/unit/example.test.ts"],
      "source": "command",
      "outcome": "passed",
      "summary": "<实际命令、检查范围与执行结果>"
    }
  ],
  "gaps": [],
  "conclusion": {
    "outcome": "passed",
    "summary": "<已验证边界与整体结论>"
  }
}
```

`selection` 使用 `focus|task-related|full`，`source` 使用 `command|agent`；`targets` 填实际测试目标，服务范围适用时增加 `service`，已知耗时可增加非负整数 `durationMs`。未覆盖项按 `{"project":"demo","testing":"smoke","reason":"实际未覆盖原因"}` 填入 `gaps`，适用时增加 `service`。保留原执行事实；只有一句“测试通过”不足以说明实际验证。

读取结果不是写入模板：`schemaVersion`、`taskId`、`scope`、`content`、`declarations`、`completedAt`、`checks[].mapStatus`、`applicability` 和报告摘要都由应用生成或派生，不放入输入文件。已观察摘要只通过 `--expected-report` 传递，命令行（CLI）将其转为应用参数 `expectedReportDigest`。

## 读取与登记

```text
<selected-writer-buildr> task verification inspect <task-id> [--content-identity <identity>] --target <canonical-workspace> --json
<selected-writer-buildr> task verification record <task-id> --report <json-file> --expected-report <absent|sha256-digest> --target <canonical-workspace> --json
```

记录前用 `inspect` 读取真实当前报告：`slot.present` 为 `false` 时使用 `absent`，否则将 `slot.reportDigest` 传给 `--expected-report`。应用核对任务处于 `active`、检查属于任务范围且与可用地图一致；在事务中比较已观察摘要并原子替换唯一当前报告，冲突时保留原值。冲突后重读真实报告和当前内容再决定，不能自动重试。地图缺失或损坏时仍可记录真实检查，应用派生“地图不可用”并补充未覆盖项，不能声称已由地图声明。

`passed` 至少需要一个实际检查且全部通过；`not-passed` 必须有失败检查；`incomplete` 用于没有失败但仍有必要边界未覆盖的情况。查看当前适用性时传入真实 `--content-identity`；未提供时内容适用性为 `unknown`，不据此重新测试。登记结果已返回当前报告、`slot.reportDigest` 和适用性，可直接核对；仅响应丢失、冲突或相关事实变化时补读。
