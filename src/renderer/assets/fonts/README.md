# 字体发布资源

HarmonyOS Sans SC 和 MiSans 的六档字重使用完整 WOFF2 资源发布。原始 TTF 与各自授权文件保留在同目录，作为生成来源；CSS 仅引用 WOFF2，因此构建不再携带这十二个 TTF。

重新生成：

```powershell
python -m pip install "fonttools[woff]==4.61.1"
python scripts/fonts/compress-cjk-fonts.py
npm.cmd run build
```

转换禁用字形与度量预处理，不做子集化、不修改字形、字重、字距或命名。生成脚本逐表校验原始数据；WOFF2 容器所需的校验和、无损转换标志以及不再适用的原始 DSIG 签名除外。原字体授权继续适用。

2026-10-28 构建字体总量由 145.61 MiB 降至 108.89 MiB，预算仍为 110 MiB。字体选择器、`unicode-range`、语义字体角色和其他字体资源保持原有配置。构建直接使用已提交的 WOFF2，无需安装 Python 依赖。

隔离 Electron 已加载十二个构建后字体，以中英、数字、繁简体、日文与韩文样本在 14px 和 32px 比较，共 72 组绘制像素与原始 TTF 一致。
