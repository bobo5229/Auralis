---
name: 声迹 · 聆听长廊
description: 以时间与作品组织个人聆听档案的交互原型
colors:
  paper: '#f4f6f3'
  ink: '#243b31'
  muted: '#596960'
  green: '#355d47'
  pale: '#e5ebe3'
  rule: '#d3ddd2'
  cover-bed: '#e7ece4'
  focus: '#246245'
typography:
  page:
    fontFamily: 'Atlas Latin, Atlas Sans, Microsoft YaHei, sans-serif'
    fontSize: 'clamp(42px, 4.4vw, 60px)'
    fontWeight: 580
    lineHeight: 1.16
    letterSpacing: '-0.035em'
  date:
    fontFamily: 'Atlas Latin, Atlas Sans, Microsoft YaHei, sans-serif'
    fontSize: 'clamp(54px, 5.4vw, 78px)'
    fontWeight: 450
    lineHeight: 1.08
    letterSpacing: '-0.04em'
  album:
    fontFamily: 'Atlas Latin, Atlas Sans, Microsoft YaHei, sans-serif'
    fontSize: 'clamp(26px, 2.5vw, 36px)'
    fontWeight: 550
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  body:
    fontFamily: 'Atlas Latin, Atlas Sans, Microsoft YaHei, sans-serif'
    fontSize: '16px'
    lineHeight: '24px'
  control:
    fontFamily: 'Atlas Latin, Atlas Sans, Microsoft YaHei, sans-serif'
    fontSize: '14px'
    lineHeight: '20px'
  caption:
    fontFamily: 'Atlas Latin, Atlas Sans, Microsoft YaHei, sans-serif'
    fontSize: '12px'
    lineHeight: '18px'
spacing:
  page: 'clamp(24px, 4.2vw, 72px)'
  columns: 'clamp(28px, 3.8vw, 64px)'
rounded:
  artwork: '0px'
  date: '3px'
  calendar-day: '2px'
  index-button: '999px'
components:
  selected-date:
    backgroundColor: '{colors.green}'
    textColor: '{colors.paper}'
    rounded: '{rounded.date}'
    width: '70px'
  time-index-button:
    textColor: '{colors.ink}'
    rounded: '{rounded.index-button}'
    padding: '9px 18px'
  time-index-button-open:
    backgroundColor: '{colors.green}'
    textColor: '{colors.paper}'
---

# Design System: 声迹 · 聆听长廊

## Overview

本轮候选方案为“聆听长廊”。使用场景是收藏者在桌面上翻看自己的音乐记录：作品封面承担视觉重心，日期建立路径，聆听次数与时长帮助理解这一天。

系统仅适用于本原型，尚待用户确认。用户已确认以个人聆听档案为主线，并要求舍弃原声迹组件及复古未来主义风格。

## Colors

冷白承接原色封面，灰绿区分档案索引与空状态，森林绿标记当前日期和可操作入口。次要文字在纸色背景的对比度约 5.35:1，在空状态底色上约 4.85:1。低强度日期格使用深字，高强度格使用浅字；选择同时通过轮廓或位置表达。

年度聆听强度依次为 `#d7e0d2`、`#b3c6a6`、`#879e76`、`#4e7146`、`#355d47`，对应 0、1–14、15–24、25–34、35 次以上。该分档用于演示数据，不改变正式产品统计规则。

## Typography

中文自托管字体为仓库已有 OPPO Sans；拉丁与数字沿用已有 Plus Jakarta Sans，作为 Auralis 现有 UI 字体角色的延续。标题与日期使用无衬线，通过字重、尺度与间距建立层级。

普通正文、控件、注释与区块标题引用项目 `typography.css` 的语义字号。声迹页名、日期、专辑名和滑轨数字为专用规格，集中定义或注明于 `atlas.css`。时间与计数使用等宽数字。

## Layout

页面上限 1640px。宽桌面为日期、完整封面、作品信息三列；封面尺寸结合窗口高度限制，为日期导航保留空间。1100px 以下把日期移至通栏，作品与目录保留双列。720px 以下依次阅读日期、封面、作品信息、目录和滑轨。

正文使用正常页面滚动。日期滑轨独立横向滚动，可用鼠标拖动、滚轮、触屏原生滚动和方向键访问。桌面年度索引显示十二个月；窄屏显示选定月份的数字日历，以保持日期格可操作。

## Elevation & Depth

分区采用留白、平面色块与 1px 细线，不使用阴影。原色封面完整显示，作为正文主视觉。

## Shapes

封面保持正方形直角。日期选择块为 3px 圆角，年度格为 2px 圆角，导航箭头为圆形。时间索引入口使用胶囊形状，与主体内容区别。

## Components

- 日期页：日期、星期、当天累计与前后翻页；未来日期不可激活。
- 专辑主视图：封面、名称、音乐人、当天次数与时长；专辑目录选择同步更新主视图。
- 曲目展开区：在正文中显示当天累计，支持 Esc 收起及焦点返回。演示曲目名称与数值均为合成数据，不伪造逐次播放时间。
- 日期滑轨：连续日期、记录点与当前位置，保留月份浏览和日期选择的区别。
- 时间索引：整年浏览、年份切换、方向键日期定位。浏览另一个年份不会替换正文；选择某一天后才更新记录。
- 记录状态：空日期保留时间导航，错误提供重试，加载设置 `aria-busy`，封面失败保留统计内容。

专辑与日期切换共用一次 430ms 的封面揭示转场，使用 `clip-path` 与轻微水平位移。快速操作会取消旧转场；窗口尺寸变化、失焦、隐藏与离开页面会清理动画。减少动态效果时直接切换。

## Do's and Don'ts

把日期作为浏览路径，把作品作为记忆主体；让数据服务当天记录。保留封面来源与演示数据标识。正式接入时继续使用既有类型化 IPC 与播放状态，不把本原型的数据或交互模拟解释为已接入的产品能力。
