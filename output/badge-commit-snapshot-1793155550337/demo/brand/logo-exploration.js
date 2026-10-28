const designs = {
  resonance: { name: '共鸣 A', source: 'assets/resonance-a.svg' },
  loop: { name: '回环 a', source: 'assets/loop-a.svg' },
  record: { name: '藏音 A', source: 'assets/record-a.svg' },
}

document.querySelectorAll('input[name="theme"], input[name="tone"]').forEach((input) => {
  input.addEventListener('change', () => {
    document.documentElement.dataset[input.name] = input.value
  })
})

document.querySelectorAll('[data-select]').forEach((button) => {
  button.addEventListener('click', () => {
    const selected = designs[button.dataset.select]
    if (!selected) return
    document.querySelectorAll('[data-select]').forEach((candidate) => {
      candidate.setAttribute('aria-pressed', String(candidate === button))
    })
    document.querySelectorAll('img[data-preview]').forEach((image) => {
      image.src = selected.source
    })
    document.getElementById('selection-label').textContent =
      `${selected.name} · 侧栏、启动页与桌面图标示意`
    const download = document.getElementById('download-link')
    download.href = selected.source
    download.download = `auralis-${button.dataset.select}-a.svg`
  })
})
