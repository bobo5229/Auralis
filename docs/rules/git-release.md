# Git 与发布

提交说明沿用中文 Conventional Commit 风格。

Auralis 的 dev 到 master 完整发布流程只在用户明确要求该流程时执行；日常修改、构建或测试完成不触发发布。打包脚本和目标以 package.json 为准，并检查实际产物；pack:dir 使用已有构建，应确认该构建对应当前修改。
