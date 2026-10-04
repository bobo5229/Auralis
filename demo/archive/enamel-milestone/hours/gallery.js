document.querySelectorAll('button[data-background]').forEach((button) => {
  button.addEventListener('click', () => {
    document.body.dataset.background = button.dataset.background
    document.querySelectorAll('button[data-background]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button))
    })
  })
})

const assetImages = [...document.images].map((image) => ({
  image,
  hours: image.getAttribute('src').match(/hours-(\d+)/)[1],
  alt: image.alt,
}))
const captions = [...document.querySelectorAll('.collection article p')].map((element) => ({
  element,
  text: element.textContent,
}))
function setBadgeState(state) {
  const unlit = state === 'unlit'
  const suffix = unlit ? '-unlit' : ''
  document.body.dataset.state = state
  assetImages.forEach(({ image, hours, alt }) => {
    image.src = `assets/hours-${hours}${suffix}.svg`
    image.alt = unlit ? `${hours} 小时未点亮徽章：统一深灰金属胚与浅浮雕数字` : alt
    const article = image.closest('article')
    if (!article) return
    article.querySelector('.asset').href = image.src
    article
      .querySelector('.asset')
      .setAttribute('aria-label', `打开 ${hours} 小时${unlit ? '未点亮' : '已点亮'} SVG`)
    article.querySelector('a[download][href$=".svg"]').href = `assets/hours-${hours}${suffix}.svg`
    article.querySelector('a[download][href$=".png"]').href =
      `assets/hours-${hours}${suffix}@2x.png`
  })
  captions.forEach(({ element, text }) => {
    element.textContent = unlit ? '尚未填釉，等待下一段聆听。' : text
  })
  document
    .querySelectorAll('button[data-state]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.state === state)),
    )
  document.querySelector('#state-note').textContent = unlit
    ? '未点亮 · 统一金属胚与目标数字'
    : '已点亮 · 珐琅与专属图案'
  document.querySelector('#template-download').hidden = !unlit
}
document
  .querySelectorAll('button[data-state]')
  .forEach((button) => button.addEventListener('click', () => setBadgeState(button.dataset.state)))
setBadgeState('unlit')
