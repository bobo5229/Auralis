const mainBadge = document.querySelector('#main-badge')
const litAlt = mainBadge.alt
const badgeId = document.body.dataset.badge
const live = badgeId === 'albums-live'
const badgeName = live ? '现场专辑' : '首张专辑'
const unlitNote = live ? '未填釉金属胚 · 浅浮雕 LIVE' : '未填釉金属胚 · 浅浮雕 1 与 ALBUM'
const litNote = document.querySelector('#state-note').textContent
document.querySelectorAll('button[data-state]').forEach((button) => {
  button.addEventListener('click', () => {
    const state = button.dataset.state
    const unlit = state === 'unlit'
    const asset = `assets/${badgeId}${unlit ? '-unlit' : ''}`
    document.body.dataset.state = state
    mainBadge.src = `${asset}.svg`
    mainBadge.alt = unlit ? `${badgeName}未点亮徽章：${unlitNote}` : litAlt
    const link = document.querySelector('.day-asset')
    link.href = `${asset}.svg`
    link.setAttribute('aria-label', `打开${badgeName}${unlit ? '未点亮' : '已点亮'} SVG`)
    document.querySelector('#svg-download').href = `${asset}.svg`
    document.querySelector('#png-download').href = `${asset}@2x.png`
    document.querySelector('#state-note').textContent = unlit ? unlitNote : litNote
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
