const designs = [
  {
    id: 'resonant',
    name: '共鸣圆体',
    description: '圆润笔画与声波 A 呼应，优先推荐用于侧栏。',
    note: '柔和 · 清晰 · 品牌统一',
    recommended: true,
  },
  {
    id: 'faceted',
    name: '几何切面',
    description: '宽厚直线与切角字腔，像独立唱片厂牌的印记。',
    note: '厚实 · 利落 · 厂牌感',
  },
  {
    id: 'editorial',
    name: '唱片衬线',
    description: '细横画、重竖画与衬线，带来唱片内页般的收藏气质。',
    note: '典雅 · 编辑感 · 收藏气质',
  },
  {
    id: 'flow',
    name: '连笔流线',
    description: '倾斜的连贯曲线，如一段手写签名；适合开屏大尺寸。',
    note: '流动 · 个性 · 签名感',
  },
  {
    id: 'signal',
    name: '电子刻字',
    description: '平直端点与开放结构，像音响面板上的精密刻字。',
    note: '精密 · 轻盈 · 电子感',
  },
]
const asset = (id) => `assets/wordmark-${id}.svg`
const concepts = document.querySelector('#concepts')
for (const design of designs) {
  const article = document.createElement('article')
  article.className = 'concept'
  article.innerHTML = `<div class="concept-copy"><h2>${design.name}${design.recommended ? '<span class="recommendation">推荐</span>' : ''}</h2><p>${design.note}</p><p>${design.description}</p></div><div class="lettering"><img src="${asset(design.id)}" alt="${design.name} Auralis 字标" /></div><div class="concept-choice"><div class="small-lockup" aria-label="小尺寸字标"><img src="${asset(design.id)}" alt="Auralis" /><span class="music">Music</span></div><button type="button" data-select="${design.id}" aria-pressed="${design.id === 'resonant'}">${design.id === 'resonant' ? '正在预览' : '预览此方案'}</button></div>`
  concepts.append(article)
}
concepts.addEventListener('click', (event) => {
  const button = event.target.closest('[data-select]')
  if (!button) return
  const design = designs.find((item) => item.id === button.dataset.select)
  for (const item of concepts.querySelectorAll('button')) {
    const selected = item === button
    item.setAttribute('aria-pressed', String(selected))
    item.textContent = selected ? '正在预览' : '预览此方案'
  }
  document.querySelector('#preview-title').textContent = `${design.name} · 应用预览`
  document.querySelector('#selection-note').textContent = design.description
  for (const image of document.querySelectorAll('.chosen-wordmark')) image.src = asset(design.id)
  const download = document.querySelector('#download')
  download.href = asset(design.id)
  download.download = `auralis-wordmark-${design.id}.svg`
})
for (const input of document.querySelectorAll('[name="theme"]')) {
  input.addEventListener('change', () => {
    if (input.checked) document.documentElement.dataset.theme = input.value
  })
}
document.querySelector('#suffix').addEventListener('change', (event) => {
  document.documentElement.dataset.suffix = event.target.checked ? 'on' : 'off'
})
