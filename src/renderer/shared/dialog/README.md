# 常规居中面板

`AppDialog.vue` 是普通居中面板的唯一外壳组件，统一遮罩、标题栏、关闭按钮、尺寸、材质、动效、滚动和焦点管理。业务组件使用内容与 footer/header-actions/subtitle/overlay 插槽，不自行定义另一套外壳。

当前使用方：设置、歌词编辑、元数据编辑、筛选、智能歌单创建、徽章收藏盒。徽章收藏盒保留专属内部材质与盒体布局，复用共享遮罩及焦点、关闭管理。歌单重命名等小型输入弹窗保留原有表单与交互，通过 `.auralis-modal-backdrop` 复用相同背景材质；全屏播放器、启动专辑演出、贴边／锚定面板不属于此组件的迁移范围。

背景材质集中在 `dialogBackdrop.css`：普通状态为 `10px` 模糊和 `18%` 黑色遮罩，减少透明度或不支持模糊时使用 `32%` 黑色遮罩。`--auralis-dialog-backdrop-bg`、`--auralis-dialog-backdrop-filter`、`--auralis-dialog-backdrop-fallback-bg` 为共享语义变量，可在主题层覆盖；业务组件不重复定义背景材质。该样式不负责外层几何、关闭策略和动效，小型弹窗仍保留原来的布局与行为。

- 默认 large，medium 用于元数据编辑；fill 使用固定上限高度。尺寸由共享样式集中维护。
- `padded/scroll` 控制内容容器。设置导航、筛选列等有内部滚动的内容使用 false，由插槽中的布局管理内部滚动。
- `as="form"` 保持表单和提交语义，`submit` 事件交给业务校验／保存。footer 插槽仍在 form 内。
- `busy` 仅表示 aria-busy；`dismissible=false` 同时禁止关闭按钮、Esc、遮罩关闭。元数据和智能歌单保存期间应用此限制。
- `close` 带 button/escape/backdrop 原因；筛选的 Escape 优先关闭内部菜单。元数据保留原来不允许点击遮罩关闭表单的行为。
- 焦点默认进入关闭按钮，也可用 initialFocus 指定输入框；关闭时使用 returnFocusTo 或 restoreFocus。共享背景所有权与现有小弹窗计数协作，不在业务组件重复注册焦点 trap。
- `ready` 与 enter-start/entered/enter-cancelled 允许设置页保留延迟加载和淡入期间延后挂载内容的行为；通用入场准备逻辑已移入同目录。
- panelClass/backdropClass/closeClass 用于语义标记与既有定位；业务不得用它们覆写外壳尺寸、圆角、底色、阴影或标题栏规格。

背景统一验证（2026-10-30）：AppDialog、设置与侧栏定向测试共 31 项通过，类型检查通过。隔离 Electron 使用真实 Renderer 和模拟 IPC，覆盖设置、筛选、歌单重命名、徽章收藏盒的深浅主题、减少透明度、Tab 导航、关闭和焦点返回，以及英文窄窗口／减少动态效果。当前 Electron 支持背景模糊，不支持模糊的降级分支仅做源码核对；本轮未进行真实曲库和全部弹窗业务流程的完整应用验收。
