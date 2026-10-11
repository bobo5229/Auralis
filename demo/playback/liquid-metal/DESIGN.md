---
name: Auralis 液态金属材质原型
description: 用专辑配色和连续镜面反射验证动态金属背景。
colors:
  panel: 'rgba(24, 24, 22, 0.94)'
  text: '#f4f3ef'
  muted: '#bbb9af'
  button: '#34342e'
  button-hover: '#48483f'
  selected: '#e4e1cb'
  focus: '#f5efb2'
typography:
  body:
    fontFamily: 'MiSans, Microsoft YaHei, system-ui, sans-serif'
    fontSize: '14px'
    lineHeight: 1.45
  caption:
    fontSize: '12px'
rounded:
  panel: '12px'
  control: '7px'
spacing:
  desktop-inset: '24px'
  narrow-inset: '12px'
---

## Overview

适用范围仅为本独立原型。主体是实时材质，控制只用于取色和参数比较。视觉基准为用户提供的 `assets/reference.png`；预览的程序化曲面是简化实现，不将当前形体视为已获用户确认的正式播放器方案。

## Colors

材质颜色来自封面或明确标记的配色样本，最多六色，按覆盖率区分主次。颜色以线性 RGB 参与着色，局部高光降低饱和度，暗部保留专辑色。控制面板使用固定中性色保证文字可读，不给整张背景施加统一压暗。

## Typography

调节界面沿用项目字体和常规 14px / 12px 规格；滑块数值使用等宽数字。歌词预览是示意内容，展示较大的暖白文字，用于发现材质与文字的竞争关系，不代表正式播放器已通过对比度验收。

## Layout

画布覆盖视口，桌面工具位于顶部，调节面板位于左下。700px 以下缩小外边距，取色信息独占首行，色板与上传操作位于下一行；模拟播放器只保留歌词。

## Elevation & Depth

金属深度由动态高度场、法线和环境反射产生。控制依靠暗色面板与画布分离；不使用装饰性光晕、面板阴影或背景模糊冒充材质。

## Shapes

材质由宽大连续曲面、局部卷曲和连续高光带组成。大形体优先，限制高频噪声和细碎镜面闪动。面板与控件采用 12px / 7px 圆角。

## Components

配色按钮显示当前选择；上传封面支持选择、拖入和键盘触发；滑块实时改变材质。参考图在可关闭的原生 dialog 中展示。纯背景隐藏控制，保留恢复入口；减少动态偏好在启动时冻结曲面。

## Do's and Don'ts

保留专辑主色与明暗层次，单独调节流速和反射柔度。先通过用户对原型的判断确认材质，再接入共享播放状态。避免用大片黑色、全面模糊或过密的噪声取代金属形体。
