# Buildr 发布：职责与主线

发布由人确定目标和公开授权，智能体（Agent）依据 `buildr-release` 调用工程工具并持续推进。本文先说明当前组成，再说明从准备到公开的主线；具体检查见[验证架构](../architecture/verification-framework.md)，插件专属事实见[插件发布说明](dsh-plugin-release.md)。

## 谁负责什么

![发布的组成与职责](../../archify/flows/release-architecture.html)

| 责任主体 | 负责什么 |
| --- | --- |
| 人 | 确定包、各自版本和范围；对准确原包及公开顺序授权 |
| 智能体（Agent） | 读事实、判断缺项、调用工具、跟踪和恢复；技能（Skill）提供方法 |
| [发布协调](../../../services/buildr/tools/release/release-orchestration-runner.ts) | 冻结选择，组合下属能力，推进纳入、逐包就绪与恢复 |
| [产品验证工程](../../code-map/product-verification-tools.md) | 统一检查定义、选择、输入、复用、执行及汇总；本机与 GitHub 是执行场所 |
| [主包产包](../../../services/buildr/test/verification/release/candidate-package.ts)与[插件产包](../../../services/dsh-plugin/tools/build-package.ts) | 分别生产原包和身份清单；主包消费正式网页构建 |
| [公开工程](../../../services/buildr/tools/release/release-publication.ts) | 在受保护环境中公开已授权原包，回读官方效果 |
| 正式记录与本机自举 | 项目测试应用管理地图，任务验证应用管理报告；自举只交给 `buildr-self-bootstrap-sync` 唯一执行器 |

源码事实来自 Git，检查事实来自原执行记录，公开事实来自官方系统。协调器记录选择、意图、运行指针及观察结果；这些事实仍须向原权威回读核对。

## 从准备到公开

![发布主线与准备边界](../../archify/flows/release-workflow.html)

| 步骤 | 交付什么，以及在哪里止步 |
| --- | --- |
| 1. 确定范围 | 人选择包、独立版本与基线，智能体调用 `prepare` |
| 2. 冻结选择 | 固定准确源码、源码树和对端；后续 `dev` 不自动进入 |
| 3. 补源码缺项 | 本机核对已有结果，只执行缺失或失效检查，导出有效证明 |
| 4. 形成候选证明 | 按需要分别产包，复用源码结果，补真实平台、原包消费及组合检查，完整汇总 |
| 5. 纳入并逐包就绪 | 将同树源码纳入受保护 `main`；采用已验证的插件原包，再核验对端、兼容与公开顺序。**准备到此停止** |
| 6. 授权公开 | 人确认展示的准确包、版本、原字节和顺序；就绪不等于公开授权 |
| 7. 公开并回读 | 受保护工作流（Workflow）消费原包，分别核对 npm、标签与官方公开效果 |
| 8. 分项收尾 | 智能体分别推进任务登记、引用清理及独立自举；后续失败不撤销公开成功 |

两个包独立版本、独立原包、独立公开。选择公开哪个包，不等于只验证那个包；兼容及共享输入决定必要组合。

## 入口与恢复

在 `services/buildr`，通过 `tools/development/run-development-node` 调用[唯一操作入口](../../../services/buildr/tools/release/release-orchestration-runner.ts)：

```text
tools/release/release-orchestration-runner.ts prepare|inspect|publish|resume --workspace <主工作空间> --packages <包选择> <对应版本参数>
```

`--packages` 可选 `buildr`、`dsh-plugin` 或两者；版本分别使用 `--version`、`--plugin-version`。`inspect` 只读，`publish --authorized` 公开当前获准内容，`resume` 先回读，再接续未完成事项。

| 当前事实 | 从哪里继续 |
| --- | --- |
| 检查、汇总或登记失败 | 只恢复对应步骤；有效检查和原包保留 |
| 测试工具变化，构建输入未变 | 核验适用性后沿用原包，只补失效检查；正式补验绑定 `--verification-source` |
| 产品或构建输入真实变化 | 重新固定选择并生产相关新包；保留仍有效的独立源码证明 |
| 请求响应未知 | 先回读原请求，不能把未知当作不存在而重复发送 |
| 两包部分成功或公开后收尾失败 | 保留成功包和已完成效果，只恢复剩余事项；清理仍须满足原绑定授权、归属和保全条件 |

原包、检查覆盖、候选完整性、公开授权、官方公开和自举结果分别成立。当前默认命令行（CLI）尚未自动接回独立自举执行器结果，因此保留 `activation: pending`，不以健康诊断（Doctor）通过冒充激活完成。
