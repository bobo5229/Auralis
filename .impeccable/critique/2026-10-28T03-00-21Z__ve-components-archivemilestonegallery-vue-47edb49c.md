---
target: 徽章页面的交互布局
total_score: 24
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 0
target_identity: "file:D:\\VSCode\\Auralis\\src\\renderer\\features\\archive\\components\\ArchiveMilestoneGallery.vue"
target_fingerprint: "sha256:51c01b2e328952a4c37749bcf58c4f9bd66b3edeea032891e9c999c571a49de6"
target_path: "D:\\VSCode\\Auralis\\src\\renderer\\features\\archive\\components\\ArchiveMilestoneGallery.vue"
timestamp: 2026-10-28T03-00-21Z
slug: ve-components-archivemilestonegallery-vue-47edb49c
---
Method: dual-agent (A: /root/badge_design_assessment_a · B: /root/badge_design_assessment_b)

结论：保留现有收藏盒方向，优先改善检视时的操作层级和拿取反馈。设计健康度 24/32，约 7.5/10；这是设计判断，不是功能验收分数。

铝盒、海绵、压痕与取放动效形成了明确的音乐收藏体验。点亮与未点亮的材质差异成立，无边框名称、条件、进度也适合这套物件展示。900×620 实际画面中，徽章与说明没有越界。

| 启发式 | 分数 /4 | 主要依据 |
|---|---:|---|
| 系统状态可见 | 3 | 分类、点亮清楚，首次检视需等待完整动画 |
| 现实世界映射 | 4 | 收藏盒和取放逻辑一致 |
| 用户控制 | 3 | 关闭、Esc、放回与切换可用 |
| 一致性 | 3 | 方向键操作与常见查看器预期不同 |
| 错误预防 | 4 | 只读体验，切换边界明确 |
| 识别优于记忆 | 2 | 灰色徽章可点击、键盘能力不够显眼 |
| 灵活性与效率 | n/a | 本次按赏玩型 Experience 表面评估 |
| 美感与精简 | 3 | 检视时背景控件仍争夺注意力 |
| 错误恢复 | 2 | 错误主要依赖小图标，重试需重开 |
| 帮助与文档 | n/a | 简单收藏体验，无需独立帮助系统 |
| 合计 | 24/32 | 良好 |

三项优先建议，均属于设计改进，本轮没有复现阻断缺陷：

1. 检视时淡出背景分类、盒沿关闭和盒内滚动箭头。现在前景关闭、检视切换与背景控件同时可见，尤其小窗口容易形成两套操作层。保留盒体与压痕，也保留用户已要求的醒目检视切换按钮，只让背景控件退场。位置：ArchiveMilestoneGallery.vue:267、badgeGallery.css:369。
2. 给未点亮徽章同等明确的拿取反馈。灰色物件容易被第一次使用的人理解为禁用，目前 hover 主要是约 2.5% 亮度变化。建议共用轻微边缘高光、很小的上浮或 zoom-in 光标，不增加锁头、状态卡或解释段落。位置：badgeGallery.css:230、ArchiveMilestoneGallery.vue:328。
3. 补足连续检视的键盘线索。保留方向键微倾，另增加 PageUp/PageDown 切换，并在左右按钮 tooltip 中提示，避免用户按左右键后误以为没有反应。位置：useBadgeInspection.ts:358、ArchiveMilestoneGallery.vue:420。

认知负担总体低至中等：三类分组与一次一枚检视合理，主要负担来自检视时前后两层控件。五枚天数徽章属于同一连续尺度，不应为了减少选项而拆掉既定单排陈列。

情绪高点是拿起翻转，放回原槽位使体验有完整结尾。初次使用者可能把灰色当成禁用；熟练用户查条件时可能觉得 1080ms 过场偏长；键盘用户需要更容易发现的操作映射。后续可讨论反复检视的速度，本轮不建议擅自缩短已确认时长。

次要观察：资源错误目前主要通过图标 title 与屏幕阅读器文案呈现，后续可提供局部简短重试反馈。本轮未故意制造资源错误，属于源码观察。

独立检测：两个目标组件源码扫描均为零命中。真实 Electron 三个场景各出现相同三条全页信号：bounce-easing、overused-font、radial-halo，定位在背景播放器或 body，不支持将它们判为徽章局部问题。真实鼠标操作、分类、滚轮横移、Esc、窄窗检视均得到运行证据；未进行 NVDA、完整键盘流程或对比度合规验收。

后续需要选择：优先处理背景层级、拿取反馈还是键盘提示；范围是先做前两项还是三项一起。保留铝盒与海绵材质、既有翻转轨迹时长和醒目的前景切换按钮。
