const mainBadge = document.querySelector('#main-badge')
const litAlt = mainBadge.alt
const badgeId = document.body.dataset.badge || 'days-7'
const dayCount = badgeId.slice(5)
const litNote = document.querySelector('#state-note').textContent
document.querySelectorAll('button[data-state]').forEach((button) => {
  button.addEventListener('click', () => {
    const state = button.dataset.state
    const unlit = state === 'unlit'
    const asset = `assets/${badgeId}${unlit ? '-unlit' : ''}`
    document.body.dataset.state = state
    mainBadge.src = `${asset}.svg`
    mainBadge.alt = unlit
      ? `连续 ${dayCount} 天未点亮徽章：统一深灰金属胚，浅浮雕 ${dayCount} 与 DAYS`
      : litAlt
    const link = document.querySelector('.day-asset')
    link.href = `${asset}.svg`
    link.setAttribute('aria-label', `打开连续 ${dayCount} 天${unlit ? '未点亮' : '已点亮'} SVG`)
    document.querySelector('#svg-download').href = `${asset}.svg`
    document.querySelector('#png-download').href = `${asset}@2x.png`
    document.querySelector('#state-note').textContent = unlit
      ? '未填釉金属胚 · 浅浮雕天数'
      : litNote
    document.querySelectorAll('button[data-state]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button))
    })
  })
})
document.querySelectorAll('button[data-background]').forEach((button) => {
  button.addEventListener('click', () => {
    document.body.dataset.background = button.dataset.background
    document.querySelectorAll('button[data-background]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button))
    })
  })
})
