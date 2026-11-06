# Renderer 视觉与交互

普通主界面与全屏播放器共用现有 playback composable 的播放状态。调整主 BrowserWindow 尺寸或生命周期时，验证主界面布局及全屏播放器的进入与退出。

## 临时状态与菜单交互

区分菜单高亮等临时交互状态、持久选择、播放状态与焦点。临时状态随所属界面关闭而结束；清理时保留仍有效的键盘选择、播放状态和焦点交接。按本次涉及的行为检查点击外部、Esc、执行操作、切换视图或离开页面等退出路径。

动态隐藏或移除菜单项时，同步核对分隔线、可操作项和键盘导航。导航与焦点定位使用稳定标识，跳过隐藏或禁用项，确保后续可操作项能正确获得焦点。

## 动态布局与滚动

长内容先确定完整显示或容器内滚动。采用局部滚动时，明确滚动容器、可用高度和输入命中区域；隐藏滚动条后，实测鼠标滚轮及本次涉及的其他输入方式。

动效、旋转、长文本或尺寸变化涉及相邻区域时，检查变换后的实际占用范围及过渡过程，并明确空间不足时的降级行为。歌词、信息区与碟片等相关层的边界一并核对，使用已确定的裁切、位置调整或隐藏策略。

## 动态背景与配色

背景随内容取色时，通过共享语义颜色变量联动该画布内的主次文字、歌词、轨道、分隔线和交互反馈。验证相关主题、开关状态及内容切换过程中的可读性，保持功能约定的主题和页面范围。

## 颜色 token 的影响范围

修改表面颜色前，核对 token 定义、主题覆盖和实际消费者，包括组件样式、UnoCSS 配置与变量别名，并明确修改共享 token 还是组件局部表面。沿用现有语义变量，保持授权范围；相邻区域需要同步变色时，统一核对背景层、过渡属性与时长。

## 材质与采样对象

毛玻璃需求先明确采样对象：CSS `backdrop-filter` 采样应用内部位于元素后方的内容；透出桌面或其他窗口需要系统窗口材质与透明层级配合。按当前 Electron 版本与目标系统确认能力、透明区域和回退方案。

桌面材质使用真实原生窗口比较目标区域与主题；原型选择按[风险与验收](validation.md#原型与音频效果)执行。

## 圆角与嵌套关系

以 Apple macOS 的桌面组件与层级为主要参考，采用同心嵌套、同类一致和容器适应原则；Auralis 的具体数值按组件尺寸和信息密度确定。

- **容器**：菜单、弹窗和参数面板按用途确定外壳半径；贴边或悬浮状态按用途选择形状。
- **交互控件**：同一类控件复用形状规则。靠近外壳圆角的高亮项，以外壳半径减去实际内缩距离推导；内缩距离计入边框和中间包装层，普通圆弧的结果最低为零。居于容器内部的独立控件按自身用途确定形状。
- **内容封面**：按展示场景、尺寸和已有用户偏好处理，外扩框同步增加半径。
- **材质绘制层**：与外壳重合且 `inset: 0` 的图层继承同一轮廓；有内缩的图层按实际距离递减半径。
- **曲线类型**：普通圆弧与 Apple `continuous` 连续曲率分别判断。采用新曲线前验证当前 Electron 的渲染支持、内外轮廓与动画表现；不能用调大半径代替连续曲率。

具体尺寸由现有语义变量和源码维护，按目标查阅：菜单使用 `src/renderer/shared/menu/menuGeometry.css`，弹窗与参数面板使用 `src/renderer/shared/styles/panelGeometry.css`，封面角色使用 `src/renderer/shared/artwork/artworkCorners.ts`。组件特有的贴边、首尾项、透明宿主和实体轮廓按其布局处理。

曲库封面分组与专辑列表的圆角偏好保持独立；封面、播放裁切层和外扩框跟随对应偏好，外扩距离同步计入半径。封面转场读取来源和目标的实际圆角，避免重复裁切。CD 圆盘、档案书脊和启动实体卡片保留各自物理形状。

按授权目标更新规格与受影响使用方，保留用户偏好及行为契约；尺寸、主题、缩放或开合动画变化时，检查实际轮廓、裁切和高亮形状。

参考：[Apple Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)、[ConcentricRectangle](https://developer.apple.com/documentation/swiftui/concentricrectangle)、[RoundedCornerStyle](https://developer.apple.com/documentation/swiftui/roundedcornerstyle)。

## 通用文字规格

普通文字使用 `src/renderer/app/styles/typography.css` 的语义角色：`caption` 辅助说明、`control` 控件、`body` 正文、`section` 区块标题、`page` 页面标题。字号与行高成对使用，通过 `.auralis-type-*` 类或对应 CSS 变量引用；字体沿用现有角色，字重和语义色表达层级，图标沿用自身尺寸规则。

曲目行、歌词、CD 浏览和声迹等专用排版按场景维护规格。调整固定行高或虚拟列表时，同步核对实际几何与估算指标。

唱片室使用独立的 `--cd-type-*` 字号与行高角色，集中定义在 `cdTypography.css`；角色、几何例外和扩展规则见[唱片室语义字号体系](../topics/albums/TECHDOC-cd-room-semantic-typography-2026-10-04.md)。

曲库虚拟列表的 CSS 实际几何必须与 virtualizer 使用的估算高度一致；相关指标集中在 src/renderer/features/library/constants/libraryLayoutMetrics.ts。

细线粗细或缩放问题结合原始截图、运行时 `devicePixelRatio` 和实际坐标排查，并通过实际渲染验证非整数缩放效果。绘制方案与检查方法参考[封面视图分割线与设备像素取整](../topics/library/TECHDOC-cover-track-divider-pixel-snapping-2026-09-28.md)。
