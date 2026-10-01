// Canvas desktop inspired by personal-computer interfaces of the early 2000s.
// All archive records below are illustrative, matching the standalone stage.
export function paintDesktop(ctx){
 const W=1024,H=768;
 function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
 function text(value,x,y,size=24,color='#273449',bold=false){ctx.fillStyle=color;ctx.font=`${bold?'bold ':''}${size}px Tahoma, Arial, 'Microsoft YaHei', sans-serif`;ctx.textBaseline='middle';ctx.fillText(value,x,y);}
 function folder(x,y,color='#f0c467'){rect(x,y,16,7,color);rect(x,y+5,34,23,color);rect(x+2,y+8,30,2,'#ffe4a0');}
 const wallpaper=ctx.createLinearGradient(0,0,0,H);wallpaper.addColorStop(0,'#32699d');wallpaper.addColorStop(1,'#7fa6bd');rect(0,0,W,H,wallpaper);
 // Keep controls inside the curved CRT's rounded corners and overscan area.
 ctx.save();ctx.translate(64,48);ctx.scale(.875,.875);
 // Desktop shortcuts remain decorative in this first screen-style revision.
 folder(34,44);text('音乐收藏',18,96,18,'#ffffff');
 rect(45,118,20,24,'#dfeefa');rect(48,121,14,3,'#6794bf');rect(48,127,14,3,'#6794bf');rect(48,133,11,3,'#6794bf');text('收听记录',18,158,18,'#ffffff');
 rect(115,47,866,651,'#18365340');
 rect(104,36,864,650,'#f4f5f6');
 const title=ctx.createLinearGradient(0,36,0,84);title.addColorStop(0,'#6f9fda');title.addColorStop(.15,'#427cc4');title.addColorStop(1,'#245a9d');rect(104,36,864,48,title);
 folder(117,49,'#f2ca67');text('Auralis — 我的音乐档案',163,61,25,'#ffffff',true);
 for(const [x,color]of [[858,'#4c81be'],[892,'#4c81be'],[926,'#ba645e']]){rect(x,47,28,27,color);ctx.strokeStyle='#c9d9ed';ctx.strokeRect(x+.5,47.5,27,26);}
 rect(865,66,13,2,'#fff');ctx.strokeStyle='#fff';ctx.strokeRect(899,54,13,12);ctx.beginPath();ctx.moveTo(933,54);ctx.lineTo(946,67);ctx.moveTo(946,54);ctx.lineTo(933,67);ctx.stroke();
 rect(104,84,864,37,'#ece9e1');text('文件    查看    收藏    帮助',124,103,21);
 rect(104,121,864,51,'#f3f1ea');folder(124,133);text('专辑统计',177,147,24,'#25476d',true);text('日视图  /  演示记录',703,147,21,'#56647a');
 rect(104,172,864,1,'#b7c3cf');
 rect(104,173,176,470,'#e5edf6');text('音乐档案',122,205,23,'#244e7c',true);rect(115,236,153,42,'#b8d2ed');folder(125,247,'#e1b55b');text('专辑',170,258,23,'#1f4267');text('单曲',170,307,22,'#405b78');text('年度总结',122,370,22,'#405b78');rect(121,414,140,1,'#b6c9dd');text('本地收藏',122,449,21,'#405b78');text('5 张专辑',122,487,20,'#5d6e83');text('演示数据',122,607,18,'#5d6e83');
 rect(280,173,688,470,'#ffffff');rect(280,173,688,42,'#e9edf2');text('名称',342,194,22,'#43516a');text('播放次数',831,194,21,'#43516a');
 const albums=['Signal Garden','Midnight Frequency','Golden Hour','Orbital Memory','Blue Horizon'],artists=['Glass Field','Parallel Youth','Solar Archive','Satellite Room','Soft Circuit'],counts=[24,17,12,8,5];
 albums.forEach((title,i)=>{const y=215+i*75,selected=i===0;rect(291,y+6,666,66,selected?'#3679c5':i%2?'#f6f8fb':'#ffffff');folder(304,y+23,selected?'#ffe098':'#e9c165');text(title,353,y+27,25,selected?'#ffffff':'#263750');text(artists[i],353,y+53,18,selected?'#dceaff':'#69788a');text(String(counts[i]),878,y+37,25,selected?'#ffffff':'#405673');});
 rect(104,643,864,43,'#ece9e1');text('5 张专辑  ·  来自本地音乐收藏',121,665,20,'#4b596d');text('已连接展示舞台',746,665,20,'#36634b');
 const bar=ctx.createLinearGradient(0,710,0,H);bar.addColorStop(0,'#6496cf');bar.addColorStop(.12,'#326dae');bar.addColorStop(1,'#245b9b');rect(0,710,W,58,bar);rect(0,710,135,58,'#477b58');folder(15,729,'#f2cf70');text('开始',59,741,27,'#fff',true);rect(146,719,313,42,'#356399');folder(158,730,'#f2cf70');text('我的音乐档案',207,740,23,'#fff');rect(852,710,172,58,'#3b7eaf');rect(875,735,8,13,'#d2edee');rect(886,727,8,21,'#d2edee');rect(897,720,8,28,'#d2edee');text('本地模式',922,740,18,'#ffffff');
 // Gentle CRT softness comes from the texture and curved screen. Sparse rows
 // keep the display character without turning the light desktop green or dark.
 rect(0,0,W,H,'#fff4de08');for(let y=2;y<H;y+=4)rect(0,y,W,1,'#152a430b');ctx.restore();
}
