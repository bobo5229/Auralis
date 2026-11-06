const albums = {
  blue: {
    title: 'Kind of Blue',
    artist: 'Miles Davis',
    year: '1959',
    count: 5,
    cover: 'kind-of-blue.jpg',
    tracks: ['So What', 'Freddie Freeloader', 'Blue in Green', 'All Blues', 'Flamenco Sketches'],
  },
  abbey: {
    title: 'Abbey Road',
    artist: 'The Beatles',
    year: '1969',
    count: 17,
    cover: 'abbey-road.jpg',
    tracks: [
      'Come Together',
      'Something',
      'Maxwell’s Silver Hammer',
      'Oh! Darling',
      'Octopus’s Garden',
    ],
  },
  post: {
    title: 'Post',
    artist: 'Björk',
    year: '1995',
    count: 11,
    cover: 'post.jpg',
    tracks: ['Army of Me', 'Hyperballad', 'The Modern Things', 'It’s Oh So Quiet', 'Enjoy'],
  },
  white: {
    title: 'The Beatles',
    artist: 'The Beatles',
    year: '1968',
    count: 30,
    cover: 'white-album.jpg',
    tracks: [
      'Blackbird — 本次补入',
      'I Will — 本次补入',
      'Back in the U.S.S.R.',
      'Dear Prudence',
      'Glass Onion',
    ],
  },
  melodrama: {
    title: 'Melodrama',
    artist: 'Lorde',
    year: '2017',
    count: 11,
    cover: 'melodrama.jpg',
    tracks: ['Green Light', 'Sober', 'Homemade Dynamite', 'The Louvre', 'Liability'],
  },
  unknown: {
    title: 'Unknown Pleasures',
    artist: 'Joy Division',
    year: '1979',
    count: 10,
    cover: 'unknown-pleasures.jpg',
    tracks: ['Disorder', 'Day of the Lords', 'Candidate', 'Insight', 'New Dawn Fades'],
  },
  1989: {
    title: '1989',
    artist: 'Taylor Swift',
    year: '2014',
    count: 13,
    cover: '1989.jpg',
    tracks: [
      'Welcome to New York',
      'Blank Space',
      'Style',
      'Out of the Woods',
      'All You Had to Do Was Stay',
    ],
  },
  lover: {
    title: 'Lover',
    artist: 'Taylor Swift',
    year: '2019',
    count: 18,
    cover: '../../albums/selection-patch/lover.jpg',
    tracks: ['I Forgot That You Existed', 'Cruel Summer', 'Lover', 'The Man', 'The Archer'],
  },
}
const dialog = document.querySelector('#album-dialog')
document.querySelectorAll('[data-album]').forEach((button) => {
  button.addEventListener('click', () => {
    const album = albums[button.dataset.album]
    document.querySelector('#dialog-title').textContent = album.title
    document.querySelector('#dialog-artist').textContent = `${album.artist} · ${album.year}`
    document.querySelector('#dialog-note').textContent =
      `${album.count} 首曲目 · ${button.dataset.album === 'white' ? '本次补入 2 首' : '专辑入库'}`
    const image = document.querySelector('#dialog-cover')
    image.src = album.cover.startsWith('../')
      ? album.cover
      : `../../playback/palette-comparison/assets/${album.cover}`
    image.alt = `${album.title} 专辑封面`
    document.querySelector('#dialog-tracks').replaceChildren(
      ...album.tracks.map((title) => {
        const item = document.createElement('li')
        item.textContent = title
        return item
      }),
    )
    dialog.showModal()
  })
})
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close())
dialog.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect()
  if (
    event.target === dialog &&
    (event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom)
  )
    dialog.close()
})
document.querySelector('#theme').addEventListener('click', () => {
  document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
})
document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('[data-filter]')
      .forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    document.querySelectorAll('[data-kind]').forEach((entry) => {
      entry.hidden = button.dataset.filter !== 'all' && entry.dataset.kind !== button.dataset.filter
    })
    document.querySelectorAll('.day').forEach((day) => {
      day.hidden = ![...day.querySelectorAll('[data-kind]')].some((entry) => !entry.hidden)
      document.querySelector(`[data-day="${day.id}"]`).hidden = day.hidden
    })
  })
})
const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
    if (!visible) return
    document
      .querySelectorAll('[data-day]')
      .forEach((link) => link.classList.toggle('active', link.dataset.day === visible.target.id))
  },
  { rootMargin: '-10% 0px -55% 0px', threshold: 0 },
)
document.querySelectorAll('.day').forEach((day) => observer.observe(day))
