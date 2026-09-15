# 当前说明目录整理

本次整理将当前产品与技术解释收敛到 `knowledge/docs/`。下表路径均相对 Product 根，供历史材料里的旧引用查找；此表仅记录这次迁移，不是必须随每次代码修改更新的全局清单。

| 原位置 | 当前位置 | 处理 |
|---|---|---|
| `knowledge/overview.md` | [knowledge/docs/capabilities.md](docs/capabilities.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/glossary.md` | [knowledge/docs/glossary.md](docs/glossary.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/architecture/product.md` | [knowledge/docs/architecture/product.md](docs/architecture/product.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/architecture/governance-gate-taxonomy.md` | [knowledge/docs/architecture/governance-gate-taxonomy.md](docs/architecture/governance-gate-taxonomy.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/architecture/verification-framework.md` | [knowledge/docs/architecture/verification-framework.md](docs/architecture/verification-framework.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/architecture/index.md` | [knowledge/docs/architecture/index.md](docs/architecture/index.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/architecture/technical.md` | [knowledge/docs/architecture/technical.md](docs/architecture/technical.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/flows/open-source-release.md` | [knowledge/docs/flows/open-source-release.md](docs/flows/open-source-release.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/flows/task-parent-coordination.md` | [knowledge/docs/flows/task-parent-coordination.md](docs/flows/task-parent-coordination.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/flows/task-closeout.md` | [knowledge/docs/flows/task-closeout.md](docs/flows/task-closeout.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/flows/project-daily-progress.md` | [knowledge/docs/flows/project-daily-progress.md](docs/flows/project-daily-progress.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/flows/openspec-change-lifecycle.md` | [knowledge/docs/flows/openspec-change-lifecycle.md](docs/flows/openspec-change-lifecycle.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/services/buildr-web.md` | [knowledge/docs/services/buildr-web.md](docs/services/buildr-web.md) | 保留内容并更新当前入口与相对引用 |
| `knowledge/services/buildr.md` | [knowledge/docs/services/buildr.md](docs/services/buildr.md) | 保留内容并更新当前入口与相对引用 |
| `docs/buildr-product.md` | [knowledge/docs/overview.md](docs/overview.md) | 保留内容并更新当前入口与相对引用 |
| `docs/architecture/buildr-project-declaration-system.md` | [knowledge/docs/architecture/buildr-project-declaration-system.md](docs/architecture/buildr-project-declaration-system.md) | 保留内容并更新当前入口与相对引用 |
| `docs/architecture/service-architecture.md` | [knowledge/docs/architecture/service-architecture.md](docs/architecture/service-architecture.md) | 保留内容并更新当前入口与相对引用 |
| `docs/architecture/workspace-code-map.md` | [knowledge/code-map/workspace.md](code-map/workspace.md) | 保留内容并更新当前入口与相对引用 |
| `docs/architecture/progressive-business-modeling.md` | [knowledge/docs/architecture/progressive-business-modeling.md](docs/architecture/progressive-business-modeling.md) | 保留内容并更新当前入口与相对引用 |
| `docs/architecture/buildr-skill-system.md` | [knowledge/docs/architecture/buildr-skill-system.md](docs/architecture/buildr-skill-system.md) | 保留内容并更新当前入口与相对引用 |
| `docs/manual/README.md` | [knowledge/docs/guides/usage.md](docs/guides/usage.md) | 保留内容并更新当前入口与相对引用 |
| `docs/roadmap/workspace-testing-and-verification-framework.md` | [knowledge/docs/architecture/workspace-testing-and-verification-framework.md](docs/architecture/workspace-testing-and-verification-framework.md) | 当前说明误放规划区，按正文用途迁入 |

`docs/buildr-product.md` 原“Roadmap”段落保留到[产品方向汇总](../docs/roadmap/product-directions.md)，当前概览链接该资料。原概览的当前能力列表保留为能力导航，详细产品解释以 `knowledge/docs/overview.md` 为主。

历史审计、`docs/archive/`、其他规划和对外文章保留原有论述；仍作导航的规划文件只修链接目标；历史变更与既有历史任务页面不迁移、不改写。历史材料引用的旧当前路径从本表定位，不把历史表述改成新事实。服务内随包参考文档仍留在原服务目录，只从当前入口引用。

迁移保留原文有价值的信息，修正已直接核实的陈旧说明：OpenSpec 1.13 的实际分工、已退役验证聚合表达，以及把现有 Buildr Web 混写为未来产品的句子。未进行所有模块行为的重新审计；本次深入建设与验证范围为[技能投射](code-map/skill-projection.md)。

[返回统一入口](README.md)
