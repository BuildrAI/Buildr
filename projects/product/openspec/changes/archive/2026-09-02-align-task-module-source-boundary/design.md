# 设计

规范必须描述真实源码。Task module仍是唯一composition root；TypeScript保证只施加到本次直接重写且已经通过strict检查的切片。共享MJS只删除退役依赖，不以改扩展名冒充完成迁移。
