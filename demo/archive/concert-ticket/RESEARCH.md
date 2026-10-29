# 演唱会纸质票调研与模板建议

调研日期：2026-10-30。目标是为 Auralis 的“每日 Top1 专辑纪念票”提炼通用结构，重点看知名艺人的实物票根与纪念票。

## 参考样本

### The Beatles，1964 年 Washington Coliseum 票根

[Smithsonian 馆藏记录](https://americanhistory.si.edu/collections/object/nmah_682963)与[馆藏实物图](https://ids.si.edu/ids/deliveryService?id=NMAH-AHB2014q079938&max=800)。

观察实物图：浅色纸、单色印刷，较大的日期数字与乐队名形成两个视觉中心；横竖细线划出日期、演出和座位区域。图像很少，文字层级清晰。

取用：明确的日期层级与单色油墨。Auralis 通过字号和留白组织信息，让专辑名成为票面的焦点。

### Michael Jackson，Bad World Tour，1988 年多地票面

[RR Auction 实物档案与说明](https://www.rrauction.com/auctions/lot-detail/349393807189440-michael-jackson-9-bad-world-tour-items/)及[实物组合图](https://cdn.rrauction.com/auction/704/3493938_1.jpg)。拍卖档案列出 Madrid、Barcelona、Lausanne 与 Tokyo 的票根、通行证和相关纸品。

观察组合图中的票：不同城市采用不同配色、人物图像与标题排布，但日期、艺人名称和票号保有明确位置。部分票面有独立的窄副券，演出身份与核验信息分开组织。

取用：图片赋予每张票独立身份。Auralis 以原始专辑封面替代人物剪影，让同一模板适用于任何专辑。

### Taylor Swift，The Eras Tour VIP 纪念票

[Ticketmaster 官方 VIP 套餐说明](https://media.ticketmaster.co.uk/tm/en-gb/img/static/pdf/2023/taylor-swift/Taylor-Swift-VIP-packages.pdf)确认套装包含 souvenir concert ticket。票面视觉通过[持有者出售实物的照片](https://poshmark.com/listing/Taylor-Swift-The-Eras-Tour-Souvenir-VIP-Ticket-with-Envelope-VIP-Exclusive-645043eb948ffe760b728793)观察：多个时期的艺人肖像、醒目标题、浅底印刷及配套票套。

来源边界：官方材料确认纪念票的存在；布局观察来自二手实拍，未做该单件的真伪鉴定。

取用：独立纪念票和收纳票套形成完整收藏体验。Auralis 用统一的票夹承接每天的票面，领取动作与历史浏览保持连贯。

## 当前模板：大封面与大标题

这是一套基于上述实物观察的设计归纳，不是对某位艺人票面的复制。

1. 约半张票以专辑封面贴边印刷，另一侧用大字号专辑名建立视觉中心。
2. 艺术家次之，日期、时长、次数、曲目数和票号以简短文字收尾。
3. 取消表格、分隔线、窄副券与条码，用纸张材质和边缘小凹口保留纸票的形态。
4. 复用播放器现有取色函数，以封面主色填充纸面，并联动文字明暗。票夹缩略票沿用同一版式；窄窗口改为上下排列。
5. 保留真实的聆听信息，界面只出现内容、状态和操作名称。

## 对应交互

- 昨日票面：首次打开可领取，盖章后留在原位，操作变为“查看我的票夹”。
- 我的票夹：按月份排列缩略票，点击放大，并可前后查看已收藏的日期。
- 日期入口：演示热力格子选定日期后的查看逻辑，历史未领取票仍可补领。
- 今日预览：演示 23:55 的预览内容，清楚区分预览和已定稿票面。

本次验证固定模板能否容纳深浅封面、不同专辑长度和中文缺封面样本。自动取色、真实日榜结算与领取持久化留待正式接入时实现。
