# 闭合 Browser 与开发 CI 验证链路

## 摘要

让 Browser capability 对适用性、selector和生产构建产物形成闭合证据，并把 `dev` PR 的主要 affected、Browser 与 Windows平台敏感反馈按真实owner重新分配。

## 背景与问题

当前 Browser dispatcher 对部分已声明适用的 Web package/config 变化会选出0个selector并成功，Browser脚本还会在验证开始时原地重建tracked `web-dist`。同时，开发PR在macOS和Windows重复完整affected plan，却没有执行独立Browser capability。这既可能漏掉Web交付问题，也产生与平台风险不匹配的重复成本。

## 目标与非目标

目标是阻止0 selector假成功，以临时构建证明tracked `web-dist` current，并让macOS持有主要affected/Browser反馈、Windows只持有显式平台敏感owner。非目标是不拆分现有重型Windows测试组、不改变Candidate topology、不增加远端Browser平台或第二验证registry。

## 受影响用户或角色

- 提交普通feature PR的维护者：更早得到准确、较少重复的反馈。
- 修改Buildr Web或Browser harness的维护者：得到selector与dist一致性的直接证据。
- 发布维护者：继续依赖稳定`Candidate gate`与现有完整Candidate拓扑。

## 核心流程

`dev` PR先在macOS按同一base运行affected/admission；Browser plan命中时再完成staging build一致性与受影响真实浏览器交互。Windows并行读取同一registry的platform projection，只运行changed paths命中的平台敏感owner。`dev → main`与手工Candidate继续走现有分布式完整门禁。

## 关键变化

- Browser plan明确区分selected、not-applicable与coverage failure。
- Web source/config变化在系统临时目录构建，并与tracked `web-dist`精确比较。
- verification registry新增Windows development allocation metadata与投影。
- dev workflow去掉跨平台完整affected重复，条件执行Browser。
- Browser capability声明补齐选择机制与staging helper的applicability/proves。

## 影响、风险与兼容性

Web source与tracked dist不一致将比当前更早失败，这是预期的fail-closed收紧。现有capability ID、requiredForDelivery、Browser resource、Candidate jobs和branch protection名称保持兼容。Windows首版仍使用较宽的现有owner，后续可在registry内继续拆分。

## 验收摘要

适用的Browser路径不再允许0 selector；非适用路径不构建或启动Chrome；Browser运行不改变Git tree且能捕获stale dist；开发CI不再在macOS/Windows重复完整affected；Windows高风险路径仍有真实结果；Candidate gate及完整分片不变。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Browser delta](specs/local-app-browser-verification/spec.md)
- [Verification quality delta](specs/product-verification-quality/spec.md)
- [Tasks](tasks.md)
