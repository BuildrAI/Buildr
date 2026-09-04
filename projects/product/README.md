# Buildr Product Project

本目录是 Buildr 的 Product Project 治理根，维护产品定位、规则、OpenSpec、能力要求、Command requirements、验证政策和 Service registry。

可执行产品由真实 Service `product/buildr` 承载，唯一 package 与源码根是 [`services/buildr/`](services/buildr/)。兼容入口 [`buildr`](buildr) 只桥接该 Service CLI，不在 Project 根保留第二份实现。

## 入口

- [Buildr 产品说明](docs/buildr-product.md)
- [OpenSpec specs](openspec/specs/)
- [当前实现事实](knowledge/overview.md)
- [Archify 技术图](knowledge/archify/index.md)
- [Buildr Service](services/buildr/README.md)
- [发布检查清单](services/buildr/docs/release-checklist.md)

开发阶段仍可从 workspace 根运行：

```bash
projects/product/buildr --help
```

package、测试与发布命令从 `projects/product/services/buildr/` 执行。
