---
name: 声迹 · 私人聆听档案 Demo
description: 通过日期、作品与聆听记录组织的现代编辑界面
colors:
  paper: '#f4f1e9'
  paper-deep: '#e9e5da'
  ink: '#272d28'
  muted: '#636a60'
  line: '#d2d3c8'
  accent: '#44686a'
typography:
  date:
    fontFamily: 'Journal Serif, Journal Mincho, serif'
    fontSize: 'clamp(60px, 5.8vw, 88px)'
    fontWeight: 350
    lineHeight: 1.02
    letterSpacing: '-0.035em'
  title:
    fontFamily: 'Journal Serif, Journal Mincho, serif'
    fontSize: 'clamp(32px, 3.15vw, 49px)'
    fontWeight: 400
    lineHeight: 1.03
    letterSpacing: '-0.032em'
  body:
    fontFamily: 'Journal Sans, Microsoft YaHei, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.6
  control:
    fontFamily: 'Journal Sans, Microsoft YaHei, sans-serif'
    fontSize: '14px'
    lineHeight: 1.6
  caption:
    fontFamily: 'Journal Sans, Microsoft YaHei, sans-serif'
    fontSize: '12px'
    lineHeight: 1.6
spacing:
  page: 'clamp(24px, 4.4vw, 88px)'
  column: 'clamp(28px, 3.4vw, 60px)'
rounded:
  artwork: '0px'
  icon-button: '50%'
components:
  icon-button:
    width: '38px'
    height: '38px'
    rounded: '{rounded.icon-button}'
    textColor: '{colors.ink}'
  icon-button-hover:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.paper}'
---

# Design System: 声迹独立原型

## Overview

以私人聆听年鉴为设计方向。用户在有环境光的桌面上翻看个人音乐记录，浅暖底色承接彩色封面。作品保留原始颜色，日期和编辑排版建立秩序。

此系统仅服务该 demo；实现为原生 HTML、CSS、JavaScript。

## Colors

暖纸色与偏绿墨色构成基础。重点色由当前专辑的固定配色决定，用于当前日期、选中作品与焦点轮廓；不覆盖正文或图像。辅助文字为 `#636a60`。

暖色背景是本轮已选的编辑方向。设计检测器对 cream palette 的提示在此作为已知风格取舍记录，不改变此方向。

## Typography

Source Serif 4 用于英文标题和日期；源流明体用于中文标题；Plus Jakarta Sans 用于拉丁 UI 文字，中文信息沿用系统黑体。字体使用本地文件。

正文 16px，控制 14px，注释 12px；窄屏部分元信息为 11px。专用的页名、日期、作品标题使用自己的字号与行高。时间和统计数字采用等宽数字特性。

## Layout

页面最大宽度 1760px。桌面是日期页边、正方形作品和信息列；主图宽度上限由 `clamp(380px, calc(100vh - 420px), 580px)` 约束，为日期索引保留首屏空间。

721–1100px 改为日期通栏与双列正文。720px 以下按照日期、封面、作品信息、日期带、聆听片段顺序纵向阅读。长列表由页面正常滚动承载，日期带独立横向滚动。

## Elevation & Depth

版面主要通过留白与细分隔线形成层次。主封面使用 `0 13px 30px -20px #262b254d` 阴影；从缩略图到主封面的过渡使用临时图层，结束后移除。

## Shapes

图像保持完整正方形与直角。箭头按钮为圆形，图片列表没有外包卡片。分隔线 1px，日期选中下划线 2px。

## Components

- **日期页边**：日、月与星期、当天累计、前后日期；未来和范围外日期不可选。
- **作品主图与列表**：选择态使用文字颜色、轮廓和箭头共同表达。缩略图通过 540ms 的二维平移和等比缩放进入主图；日期切换使用 580ms 的方向裁切。
- **日期带**：按钮携带日期和当天代表封面；支持拖动、触屏原生滚动、键盘。窗口尺寸改变后定位到当前选择。
- **日期索引**：在原页面展开。支持 Esc、点击外部关闭及焦点返回。
- **聆听片段**：按时间排列，次数与分钟之和对应所选专辑的当天累计。
- **无记录状态**：保留日期导航，提供回到有记录日期的操作。
- **动态设置**：`prefers-reduced-motion` 跳过空间转场；滚动、失焦、隐藏和尺寸变化会结束临时动画。

## Do's and Don'ts

让每个可操作元素对应一个真实原型行为；以作品与时间构成识别度。公开素材与合成记录保留来源和标识。后续接入正式产品时重新确认数据契约，不能把演示片段当成已有后端能力。
