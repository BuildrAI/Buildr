# 网页阅读关联（Knowledge Index）

只在项目启用知识阅读时使用 `knowledge/index.yml`。服务的索引位于工作空间（Workspace）的 `services/<code>/knowledge/index.yml`，代码来源按已登记代码库实例和服务模块解析。项目引用共享服务来源时使用 `scope: { kind: service, id: <服务标识> }`，服务只能读取自己的来源。

索引保留身份和关联，正文仍是独立文件。列表显式展开，不使用 YAML 锚点或别名；程序写入后按实际读取器校验格式。下面为最小示例，实际交付时替换为真实路径和已核实的职责说明：

```yaml
schemaVersion: buildr.knowledge-index/v1
scope: { kind: project, id: demo }
objects:
  - { id: orders, title: 订单, summary: 订单处理职责与实现 }
artifacts:
  - id: order-map
    title: 订单实现组织
    kind: code-map
    path: knowledge/code-map/orders.md
    objects: [orders]
    sources: [order-app]
sources:
  - id: order-app
    title: 订单应用
    kind: code
    path: src/orders/application.ts
    summary: 组织订单提交用例与事务顺序，领域规则由订单对象承担。
relations:
  - { from: orders, to: order-app, kind: implements }
```

- 来源可选 `summary` 保存经事实核实的文件总体说明；成果可选 `files` 引用已登记的相关文件标识，列出它自己的正文、图源、展示和依据。`sources` 仍表示规范与实现等事实依据，两者不混用。旧索引无需补齐全部字段才能阅读。
- 标识在当前索引内唯一。对象可声明 `parent`；成果类型为 `document`、`diagram`、`code-map` 或 `terms`。
- 来源类型为 `code`、`spec`、`skill` 或 `evidence`。普通路径相对于对象的真实来源根；服务代码相对于服务模块。技能（Skill）通过 `skillId` 读取当前登记来源，`path` 相对于该技能目录。`link` 可把文中的实际源文件链接映射到同一技能详情，不改变读取授权。
- 网页直接读取当前文件并返回可读性。旧索引的 `observedDigest` 和 `graphDigest` 兼容解析但不参与内容变化判断；维护阅读关联时不要求添加或更新这些历史摘要。文件修改后重新打开或刷新即可查看。
- 技术图（Technical Diagram）可声明 `graphSource` 关联图源。维护时核对并一并交付图源和展示；网页不以历史摘要作为阅读或确认门槛。
- 文档以普通相对链接引用来源；以 `![说明](相对成果路径)` 内嵌已登记且覆盖同一对象的图或地图。独立阅读仍保留真实文件位置。关系类型为 `contains`、`guides`、`implements`、`based-on`、`explains`，只写有实际阅读用途的关系。
- 更新索引前重读当前版本，保留并发修改。删除来源先判断职责迁移，更新或解除失效关联；范围外缺口单独提出建议。


## 可点击文件树与按需对照

地图用标准嵌套列表保留目录层级，目录写职责，文件用原生链接，明确路径相对根。例如：

```markdown
路径相对于当前项目根，仅展开订单模块。

- **`src/orders/`** — 订单能力
  - `application/` — 组织处理用例
    - [submit.ts](../../src/orders/application/submit.ts) — 提交及事务顺序
```

同时把被点击文件登记为当前成果的来源。技能（Skill）链接使用面向人的名称和职责说明，规范依据就近放在职责说明内。三个分类列表统一进入主屏详情，正文中的关联图与地图在副屏展开，切换正文保持已有对照；默认展开至加粗的业务目录，目录名、引导线和键盘均可折叠；未标记时默认展示前两层。文件先读总体说明再读源文件，异常就近提示。检查原文独立可读及实际页面引用，不只检查列表样式。
