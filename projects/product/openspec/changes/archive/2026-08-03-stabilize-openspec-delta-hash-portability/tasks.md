## 1. 可移植 delta identity

- [x] 1.1 将 delta parser 的哈希输入改为排序后的逻辑 delta 文件路径与规范化内容，同时保留绝对源路径供 I/O 使用。
- [x] 1.2 确认旧 receipt 遇到新 hash 时仍走既有的 fail-closed 重规划路径，且不引入 receipt 改写。

## 2. 回归覆盖

- [x] 2.1 增加两个不同绝对根下相同 delta 得到相同 `deltaHash` 的测试，并覆盖逻辑路径或规范化内容变化。
- [x] 2.2 运行受影响的 OpenSpec parser/contract 验证，确认现有收敛行为未回归。

## 3. 当前认知

- [x] 3.1 创建并收敛本 Change 的 Brief 与影响记录；确认无需扩展其他 current knowledge 或 glossary。
