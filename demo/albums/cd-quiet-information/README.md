# 唱片室安静播放信息原型

在仓库根目录运行 `python -m http.server 8765 --bind 127.0.0.1`，打开 http://127.0.0.1:8765/demo/albums/cd-quiet-information/ 。原型使用仓库内字体和演示封面，不访问曲库或网络服务。

右下角控制可切换浏览/聚焦、浅色/深色、长标题和同/其他专辑；隐藏控制后，右下角淡显按钮可恢复。页面按 1707×1019 的可用区域设计，内容为静态演示，无实际播放。

运行 `npx.cmd electron demo/albums/cd-quiet-information/verify.cjs` 执行离屏检查；需先启动上述本地服务。脚本将截图与隔离配置写入系统临时目录，并输出路径。
