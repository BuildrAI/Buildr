## 1. 迁移清单与目标目录

- [x] 1.1 盘点当前 Product 非归档 knowledge 文件、当前路径消费者和历史 task board/cockpit 保留清单，确认迁移集合不包含历史页面
- [x] 1.2 在 Product 根建立 `knowledge/`、`knowledge/architecture/`、`knowledge/flows/`、`knowledge/services/` 和 `knowledge/archify/` 主干，并为 Archify 未来维度保留受控目录参考

## 2. 迁移当前态知识与技术图

- [x] 2.1 将 `openspec/knowledge/overview.md`、`glossary.md`、`buildr-current-state.md`、`architecture/`、`flows/` 和 `services/` 精确迁移到 Product 根 `knowledge/`
- [x] 2.2 将首张 Buildr 系统全景 Archify JSON/HTML 从旧路径迁移到 `knowledge/archify/system/`，同步更新图内来源路径
- [x] 2.3 创建 `knowledge/archify/index.md`，说明 Archify 源码、HTML 产物、事实来源和未来维度目录；不创建新的空知识文档
- [x] 2.4 为 `product`、`application`、`data`、`technology` 和 `flows` 等未来 Archify 维度创建最小目录占位，确保占位内容不被解释为当前事实

## 3. 收敛文档入口与内部链接

- [x] 3.1 更新 Product README、文档索引、架构入口和当前产品文档，使 `knowledge/overview.md` 成为当前态入口
- [x] 3.2 更新当前 docs、knowledge、Service 文档和非归档维护说明中的相对链接；保留历史 archive 原始路径和内容
- [x] 3.3 在 `knowledge/architecture/index.md` 和 `knowledge/archify/index.md` 建立文字架构与可视化架构的双向导航，不复制完整内容

## 4. 更新实现侧路径消费者

- [x] 4.1 更新 current-knowledge、terminology-governance、agent-first-design 等 Product Skill/contract 中的 canonical knowledge 和 glossary 路径
- [x] 4.2 更新 Buildr Doctor、路径诊断、当前知识读取器和 Product contract tests，使它们读取新的 `knowledge/` 根
- [x] 4.3 按现有 Product source/manifest 边界同步更新 `services/buildr/resources/` 中随包 Skill 与 contract 的路径引用，不修改用户 Workspace 或 retained runtime 投射
- [x] 4.4 复核 Project/Service registry、Task-scoped Change resolver、OpenSpec CLI 根和历史页面保护边界，确认 `openspec/specs/` 与 `openspec/changes/` 未被迁移

## 5. 验证与收敛

- [x] 5.1 使用限定范围检索确认当前代码、Skill、spec、docs 和 tests 不再把新 current knowledge 解析为旧路径；历史 archive 旧路径仅保留为历史旁证
- [x] 5.2 运行 `openspec validate reorganize-product-knowledge-root --strict` 和 Buildr convergence preflight，修复 planning 与 canonical path 诊断
- [x] 5.3 使用最新 Product tree 重新验证并交付 `knowledge/archify/system/` 的 Archify JSON/HTML，完成 9/9 showcase 和多尺寸 visual-check
- [x] 5.4 运行受影响的 current knowledge、terminology、Doctor、路径契约和文档/静态检查，记录实际结果与未覆盖范围
- [x] 5.5 复核最终变更只包含当前态知识主干、首图迁移和对应路径消费者，未引入图表治理、自动对齐或产品业务行为变化
