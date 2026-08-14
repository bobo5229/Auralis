# Phase 7 截图归档说明

本目录用于归档 Phase 7 基线和交付截图。Phase 7 代码实现与人工验收已完成并通过。

## 必需窗口

- `900x620`
- `1279x800`
- `1280x800`
- `1600x900`

## 建议命名

文件名至少包含窗口尺寸、视觉风格和视图，例如：

```text
900x620-modern-flat.png
900x620-manuscript-flat.png
1279x800-manuscript-cover.png
1280x800-manuscript-flat-playing.png
1600x900-manuscript-cover-paused.png
```

交付时应覆盖：

- modern / manuscript；
- flat / cover；
- normal、hover、selected、playing、paused；
- 长文本、中英混排、多值艺人和缺失 metadata；
- 搜索框隐藏、显示、聚焦和带查询。

截图不能替代 DevTools computed geometry 记录。44px、40px、250px 和封面组估算高度需要在交付记录中单独填写。
