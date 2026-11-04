import { analyze } from './patch'
import { albumDetailColors, cssAlbumColor } from '../../../src/renderer/features/albums/albumDetailColors'
const $ = <T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!
const image=$<HTMLImageElement>('#cover'), results=$<HTMLElement>('#results'), input=$<HTMLInputElement>('#upload'), status=$<HTMLElement>('#status')
let request=0, objectUrl:string|null=null
const hex=(c:{r:number;g:number;b:number})=>'#'+[c.r,c.g,c.b].map(n=>Math.round(n).toString(16).padStart(2,'0')).join('').toUpperCase()
async function load(url:string, name:string) {
  const id=++request
  const next=new Image(); next.src=url; await next.decode()
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=48
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!; ctx.drawImage(next,0,0,48,48)
  const result=analyze(ctx.getImageData(0,0,48,48).data)
  if(id!==request)return false
  image.src=url; $<HTMLElement>('#sample-name').textContent=name
  status.textContent=result.reason
  results.innerHTML=''
  for(const [index,color] of [result.base.dominant.rgb,result.patched].entries()) {
    const c=albumDetailColors(color), el=document.createElement('article');el.className='card'
    for(const [key,value] of Object.entries({main:c.main,side:c.side,more:c.more,text:c.mainText,muted:c.mainMuted,divider:c.divider,sideText:c.sideText,lyric:c.lyricsActive,lyricMuted:c.lyricsInactive}))el.style.setProperty('--'+key,cssAlbumColor(value))
    el.innerHTML=`<div class="heading"><div><span>0${index+1}</span><h2>${index?'补丁策略':'当前策略'}</h2></div><div class="color"><i></i><code></code></div></div><div class="preview"><aside class="side"><b>A</b><p>搜索</p><p>专辑</p><p>歌曲</p></aside><section class="middle"><div class="album"><img alt=""><div><b>专辑名称</b><p>艺术家</p></div></div><div class="tracks"><p>01 <span>第一首歌</span>3:28</p><p>02 <span>下一段旅程</span>3:45</p><p>03 <span>留在此刻</span>4:06</p></div><div class="more">更多作品推荐</div></section><aside class="lyrics"><small>歌词</small><p>让时间停在这一刻</p><p>把喧嚣留在远处</p></aside></div>`
    el.querySelector<HTMLElement>('.color i')!.style.background=cssAlbumColor(color);el.querySelector('code')!.textContent=hex(color);el.querySelector<HTMLImageElement>('.album img')!.src=url; results.append(el)
  }
  const list=$<HTMLElement>('#candidates');list.innerHTML=''
  if (!result.candidates.length) list.textContent='当前主色无需补充分析。'
  for (const c of result.candidates) { const item=document.createElement('div');item.className='candidate';const dot=document.createElement('i');dot.style.background=cssAlbumColor(c.rgb);const text=document.createElement('span');text.textContent=`${hex(c.rgb)}  面积 ${(c.count/result.total*100).toFixed(1)}%  中心占该色 ${(c.center/c.count*100||0).toFixed(0)}%${result.selected===c?'  已选':''}`;item.append(dot,text);list.append(item) }
  return true
}
document.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach(b=>b.addEventListener('click',()=>{const img=b.dataset.sample==='doja'?__DOJA__:__LOVER__;void load(img,b.dataset.sample==='doja'?'Central Cee — Doja':'Taylor Swift — Lover').catch(e=>status.textContent=String(e))}))
input.addEventListener('change',async()=>{const f=input.files?.[0];input.value='';if(!f)return;const url=URL.createObjectURL(f);try{const ok=await load(url,f.name);if(!ok){URL.revokeObjectURL(url);return}if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=url}catch(e){URL.revokeObjectURL(url);status.textContent=`无法读取图片：${String(e)}`}})
declare const __DOJA__:string; declare const __LOVER__:string
void load(__DOJA__,'Central Cee — Doja').catch(e=>status.textContent=String(e))
