# 聆听纪念容器 · 麂皮收藏匣首版

2026-10-24，沿用已确认的档案顶部右侧位置，制作「炭灰麂皮内衬＋薄银色盒沿」效果。

- [材质局部放大](suede-closeup.png)
- [完整页面](suede-desktop.png)
- [紧凑窗口](suede-compact.png)
- [窄窗口横条](suede-narrow.png)

材质由 [CSS](suede-case.css) 和 [静态短绒纹理生成器](install-suede-case.cjs) 渲染。银色薄边、内衬凹入阴影与徽章接触阴影共享左上方受光方向。纹理只生成一次，不持续绘制。页面内徽章为原始资产示意，未接入解锁判定或 GLSL 材质。

上面的 `suede-*` 图片记录最初在 Renderer 中临时插入的效果预览。聆听数据通过原仓库查询只读数据库，封面缓存只读；其他接口使用无副作用的预览返回值，使用临时 Electron profile，不启动扫描或音频播放。

重现时，先从仓库根目录运行：

```powershell
node output/archive-badge-placement/prepare.mjs
node output/archive-badge-placement/serve.mjs
```

在另一个 PowerShell 中截图：

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
Start-Process -FilePath ./node_modules/electron/dist/electron.exe -ArgumentList 'output/archive-badge-placement/verify-integration.cjs' -WindowStyle Hidden -Wait
```

已检查三枚资产加载、标题与徽章不重叠，以及 1440×960、1100×800、900×760 三种请求窗口尺寸的实际画面。本机系统缩放为 150%，实际 CSS 视口存在设备像素取整；以 [截图记录](suede-report.json) 为准。局部图是同一 DOM/CSS 的三倍放大渲染。

## 产品接入

同日已将收藏匣接入 `ArchivePage.vue`。材质为 `ArchiveMilestoneCase.vue` 和 `milestoneCase.css`，静态短绒纹理随产品打包，不在运行时生成。首页陈列三枚图鉴预览；「查看全部」延迟加载 11 枚徽章图鉴，复用 AppDialog 的滚动、关闭和焦点管理。没有新增达成判定或写入聆听记录。

- [接入后实际页面](integrated-desktop.png)
- [完整徽章图鉴](integrated-gallery.png)
- [窄窗口](integrated-narrow.png)
- [英文与浅色主题](integrated-english-light.png)
- [15 项运行检查](integration-report.json)

运行检查使用实际产品组件，没有插入原型 DOM/CSS；覆盖资产加载、布局、年份切换、Enter 打开、Tab 焦点约束、Escape／关闭按钮／遮罩退出、焦点恢复与离开页面清理。另已通过类型检查、定向 ESLint、语言键检查和 32 条相关回归测试。运行期间出现既有的 `settings.musicLibrary.addFolder` 语言键警告，未发现本次组件的运行错误。
