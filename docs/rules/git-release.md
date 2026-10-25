# Git 与发布

提交说明沿用中文 Conventional Commit 风格。

仅在用户明确要求时执行 Auralis 的 dev 到 master 完整发布流程。打包脚本和目标以 package.json 为准，完成后检查实际产物；`pack:dir` 使用已有构建，执行前确认构建包含当前修改。
