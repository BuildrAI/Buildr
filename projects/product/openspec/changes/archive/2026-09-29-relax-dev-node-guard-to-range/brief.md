# Brief：开发 checkout Node 守卫放宽为声明版本锚定的范围接受

## 背景问题

开发命令入口要求 Node 与 `.node-version`（24.15.0）精确相等，而正式 npm 包 `engines.node` 与 Development launcher 安装检查接受 `>=24.15.0 <25`；满足产品范围的 Node（如 24.21.0）被启动器接受、被开发入口拒绝，造成本机必须额外下载精确版本才能运行任何开发命令的摩擦。rc.18 曾以"类型擦除行为随 minor 有差异"收紧为精确固定；本次 24.15.0 与 24.21.0 对照实测（单元 274/274、契约 211/212，唯一失败与版本无关）未复现该差异。

## 目标与范围

开发入口接受规则改为"与声明版本同主版本且不低于声明版本"；`.node-version` 保留为声明/供给版本，Candidate 非 host 准备与 CI development jobs 继续锚定声明版本；身份与审计记录实际选中对象。规格 delta 覆盖 `buildr-service-typescript-execution`、`npm-cli-package`、`product-verification-quality` 三个能力；实现覆盖两份解析器与 `development-entry.test.ts`。

## 约束

- 不引入版本管理器安装、runtime 下载或新的用户目录扫描；不放宽上界到 Node 25+。
- 本变更推翻 rc.18 的精确固定决定，依据（对照实测数据、产品内范围/精确政策并存的矛盾）留在提案与设计。
- 规格正文中文，Requirement 用 MUST/SHALL，Scenario 用 WHEN/THEN。

## 验收要点

- 两份解析器（.sh/.cmd）行为一致：范围内接受、声明版本优先、范围外 fail fast 且消息含范围。
- `development-entry.test.ts` 全部用例在新语义下通过，且以 24.15.0 与 24.21.0 运行结果一致。
- `openspec validate --strict` 与 `buildr openspec convergence preflight` 通过。

## 知识影响（assess 摘要）

来源核对范围：`knowledge/`。受影响成果：`knowledge/docs/flows/open-source-release.md:29`（"精确 Node"表述将失真，需改为范围接受 + 声明供给）、`knowledge/code-map/README.md:11`（"固定开发 Node 版本"措辞需校准）、`knowledge/docs/architecture/technical.md:43` 与 `knowledge/code-map/product-verification-tools.md`、`knowledge/docs/architecture/verification-framework.md`、`knowledge/index.yml`（命中待实现期逐项核对）。维护工作已纳入 tasks.md 第 4 组。
