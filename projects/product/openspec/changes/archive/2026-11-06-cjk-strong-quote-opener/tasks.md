## 1. 实现

- [x] 1.1 在 `services/buildr-web/src/markdown.ts` 的 `cjkStrong` 扩展中补开符紧贴标点的兼容规则，保持其余语法交给默认 lexer。
- [x] 1.2 在 `services/buildr/test/unit/buildr-web-markdown.test.ts` 补回归：目标写法、全角引号与括号、代码/转义/未闭合负例、既有闭合侧兼容。

## 2. 验证

- [x] 2.1 运行 `buildr-web` 相关单元测试与类型检查，确认无回归。
