# 常规居中面板

`AppDialog.vue` 是普通居中面板的唯一外壳组件，统一遮罩、标题栏、关闭按钮、尺寸、材质、动效、滚动和焦点管理。业务组件使用内容与 footer/header-actions/subtitle/overlay 插槽，不自行定义另一套外壳。

当前使用方：设置、歌词编辑、元数据编辑、筛选、智能歌单创建。歌单重命名等小型输入弹窗保留原实现；全屏播放器、启动专辑演出、贴边／锚定面板不属于此组件的迁移范围。

- 默认 large，medium 用于元数据编辑；fill 使用固定上限高度。尺寸由共享样式集中维护。
- `padded/scroll` 控制内容容器。设置导航、筛选列等有内部滚动的内容使用 false，由插槽中的布局管理内部滚动。
- `as="form"` 保持表单和提交语义，`submit` 事件交给业务校验／保存。footer 插槽仍在 form 内。
- `busy` 仅表示 aria-busy；`dismissible=false` 同时禁止关闭按钮、Esc、遮罩关闭。元数据和智能歌单保存期间应用此限制。
- `close` 带 button/escape/backdrop 原因；筛选的 Escape 优先关闭内部菜单。元数据保留原来不允许点击遮罩关闭表单的行为。
- 焦点默认进入关闭按钮，也可用 initialFocus 指定输入框；关闭时使用 returnFocusTo 或 restoreFocus。共享背景所有权与现有小弹窗计数协作，不在业务组件重复注册焦点 trap。
- `ready` 与 enter-start/entered/enter-cancelled 允许设置页保留延迟加载和淡入期间延后挂载内容的行为；通用入场准备逻辑已移入同目录。
- panelClass/backdropClass/closeClass 用于语义标记与既有定位；业务不得用它们覆写外壳尺寸、圆角、底色、阴影或标题栏规格。

施工状态：实现完成，未测试。已进行源码与差异复查，未运行类型检查、测试、构建或视觉验收。后续需检查五处入口的深浅主题、窄窗口与滚动、关闭及焦点返回、保存期间禁止关闭、筛选内菜单的 Escape、设置延迟加载／减少动效／快速重开，以及大面板和既有小弹窗的背景 inert 状态恢复。
