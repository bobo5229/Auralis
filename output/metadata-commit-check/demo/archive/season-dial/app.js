/* Standalone layout prototype. All tracks and counts below are illustrative, with no IPC or audio. */
;(() => {
  'use strict'

  const seasons = [
    {
      id: 'spring',
      character: '春',
      english: 'SPRING',
      months: '03 — 05 月',
      colors: ['#72b99b', '#c1dfc0', '#eac2c8', '#edf1cf'],
      tracks: [
        ['春日来信', '岸边电台'],
        ['Green Window', 'Mild Hours'],
        ['等一场雨', '林间集'],
        ['新枝', '白日梦游'],
        ['Somewhere in April', 'Paper Boats'],
        ['慢慢醒来', '余音'],
        ['白色清晨', '低空飞行'],
        ['First Light', 'Sunday Room'],
        ['微风来访', '岸边电台'],
        ['路过花期', '林间集'],
        ['A Little Closer', 'Mild Hours'],
        ['去往春天', '余音'],
      ],
    },
    {
      id: 'summer',
      character: '夏',
      english: 'SUMMER',
      months: '06 — 08 月',
      colors: ['#3ca7bb', '#b6e2cf', '#efd593', '#65b4ce'],
      tracks: [
        ['海岸线', '蓝色星期天'],
        ['Saltwater', 'Sunday Room'],
        ['午后三点', '白日梦游'],
        ['透明的夏天', '余音'],
        ['Daylight Radio', 'Mild Hours'],
        ['游向你', '岸边电台'],
        ['漫长的晴天', '林间集'],
        ['Poolside', 'Paper Boats'],
        ['在落日之前', '低空飞行'],
        ['热带夜晚', '蓝色星期天'],
        ['A Place in the Sun', 'Sunday Room'],
        ['晚霞放映室', '余音'],
      ],
    },
    {
      id: 'autumn',
      character: '秋',
      english: 'AUTUMN',
      months: '09 — 11 月',
      colors: ['#9f4550', '#d98340', '#f0d599', '#d9a982'],
      tracks: [
        ['晚风经过', '低空飞行'],
        ['September Again', 'Mild Hours'],
        ['慢慢走', '余音'],
        ['日落之前的最后一封信', '岸边电台'],
        ['Amber', 'Sunday Room'],
        ['秋日列车', '林间集'],
        ['留在昨天', '白日梦游'],
        ['The Way Home', 'Paper Boats'],
        ['长街', '低空飞行'],
        ['橘色星期天', '蓝色星期天'],
        ['A Quiet Afternoon', 'Mild Hours'],
        ['把时间留给你', '余音'],
      ],
    },
    {
      id: 'winter',
      character: '冬',
      english: 'WINTER',
      months: '01 · 02 · 12 月',
      colors: ['#889abf', '#b6aacb', '#edf0f2', '#c3d8e2'],
      tracks: [
        ['雪落无声', '林间集'],
        ['Blue Hour', 'Sunday Room'],
        ['冬夜来客', '余音'],
        ['灯火之间', '低空飞行'],
        ['Stay a Little Longer', 'Paper Boats'],
        ['一月的信', '岸边电台'],
        ['等天亮', '白日梦游'],
        ['Northern Lights', 'Mild Hours'],
        ['炉边', '林间集'],
        ['十二月慢行', '蓝色星期天'],
        ['When the City Sleeps', 'Sunday Room'],
        ['明年见', '余音'],
      ],
    },
  ]
  const root = document.documentElement
  const dial = document.querySelector('#dial')
  const list = document.querySelector('#track-list')
  const caption = document.querySelector('#season-caption')
  const panel = document.querySelector('#season-content')
  const tabs = [...document.querySelectorAll('.season-button')]
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const today = new Date()
  const month = today.getMonth() + 1
  let selected =
    month >= 3 && month <= 5 ? 0 : month >= 6 && month <= 8 ? 1 : month >= 9 && month <= 11 ? 2 : 3
  let turn = selected * -90
  let revision = 0
  let animations = []
  let playing = false
  let player = { season: selected, track: 0 }
  const svgNS = 'http://www.w3.org/2000/svg'

  function point(radius, degrees) {
    const angle = ((degrees - 90) * Math.PI) / 180
    return [240 + radius * Math.cos(angle), 240 + radius * Math.sin(angle)]
  }
  function arcPath(start, end) {
    const outerStart = point(184, start),
      outerEnd = point(184, end)
    const innerStart = point(149, start),
      innerEnd = point(149, end)
    return `M${outerStart} A184,184 0 0,1 ${outerEnd} L${innerEnd} A149,149 0 0,0 ${innerStart} Z`
  }
  for (let i = 0; i < 12; i++) {
    const tick = document.createElementNS(svgNS, 'line')
    const start = point(197, i * 30),
      end = point(i % 3 === 0 ? 204 : 201, i * 30)
    tick.setAttribute('x1', start[0])
    tick.setAttribute('y1', start[1])
    tick.setAttribute('x2', end[0])
    tick.setAttribute('y2', end[1])
    tick.classList.add('dial-tick')
    document.querySelector('#dial-ticks').append(tick)
  }
  const arcs = seasons.map((season, index) => {
    const arc = document.createElementNS(svgNS, 'path')
    arc.setAttribute('d', arcPath(index * 90 - 42, index * 90 + 42))
    arc.setAttribute('fill', `url(#${season.id}-colors)`)
    arc.classList.add('season-arc')
    arc.addEventListener('click', () => selectSeason(index))
    document.querySelector('#dial-arcs').append(arc)
    return arc
  })

  function coverArt(seasonIndex, trackIndex) {
    const colors = seasons[seasonIndex].colors
    const a = colors[trackIndex % 4],
      b = colors[(trackIndex + 1) % 4],
      c = colors[(trackIndex + 2) % 4]
    const x = 18 + ((trackIndex * 29) % 75)
    return `radial-gradient(ellipse at ${x}% 20%, ${c} 0, transparent 66%), linear-gradient(${115 + trackIndex * 19}deg, ${a}, ${b})`
  }
  function icon(name) {
    const svg = document.createElementNS(svgNS, 'svg')
    svg.classList.add('icon')
    svg.setAttribute('aria-hidden', 'true')
    const use = document.createElementNS(svgNS, 'use')
    use.setAttribute('href', `#i-${name}`)
    svg.append(use)
    return svg
  }
  function updateSelection() {
    root.dataset.season = seasons[selected].id
    dial.style.setProperty('--dial-turn', `${turn}deg`)
    tabs.forEach((tab, index) => {
      tab.setAttribute('aria-selected', String(index === selected))
      tab.tabIndex = index === selected ? 0 : -1
      arcs[index].classList.toggle('is-selected', index === selected)
    })
    panel.setAttribute('aria-labelledby', `season-tab-${selected}`)
  }
  function updateTrackSelection() {
    list.querySelectorAll('.track-row').forEach((row, index) => {
      const active = playing && player.season === selected && player.track === index
      row.classList.toggle('is-playing', active)
      row.setAttribute('aria-pressed', String(active))
      const rank = row.querySelector('.track-rank')
      rank.replaceChildren(
        active ? icon('play') : document.createTextNode(String(index + 1).padStart(2, '0')),
      )
    })
  }
  function renderSeason() {
    const season = seasons[selected]
    document.querySelector('#season-character').textContent = season.character
    document.querySelector('#season-months').textContent = season.months
    document.querySelector('#season-english').textContent = season.english
    document.querySelector('#track-count').textContent = `${season.tracks.length} 首`
    list.setAttribute(
      'aria-label',
      `${today.getFullYear()} 年${season.character}季常听歌曲，示例数据`,
    )
    const fragment = document.createDocumentFragment()
    season.tracks.forEach(([title, artist], index) => {
      const item = document.createElement('li')
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'track-row'
      row.setAttribute('aria-label', `预览播放 ${title}，${artist}，无音频`)
      const rank = document.createElement('span')
      rank.className = 'track-rank'
      rank.setAttribute('aria-hidden', 'true')
      const cover = document.createElement('span')
      cover.className = 'track-cover'
      cover.setAttribute('aria-hidden', 'true')
      cover.style.setProperty('--cover-art', coverArt(selected, index))
      const metadata = document.createElement('span')
      metadata.className = 'track-metadata'
      const trackTitle = document.createElement('span')
      trackTitle.className = 'track-title'
      trackTitle.textContent = title
      trackTitle.title = title
      const trackArtist = document.createElement('span')
      trackArtist.className = 'track-artist'
      trackArtist.textContent = artist
      metadata.append(trackTitle, trackArtist)
      const count = document.createElement('span')
      count.className = 'track-count'
      count.textContent = String(96 - index * 6 - selected * 2)
      row.append(rank, cover, metadata, count)
      const seasonIndex = selected
      row.addEventListener('click', () => previewTrack(seasonIndex, index))
      item.append(row)
      fragment.append(item)
    })
    list.replaceChildren(fragment)
    document.querySelector('#track-scroll').scrollTop = 0
    updateTrackSelection()
  }

  function cancelAnimations() {
    animations.forEach((animation) => animation.cancel())
    animations = []
  }
  async function selectSeason(index, focus = false) {
    index = (index + 4) % 4
    if (index === selected) return
    const currentRevision = ++revision
    const steps = ((index - selected + 6) % 4) - 2
    turn -= steps * 90
    selected = index
    updateSelection()
    if (focus) tabs[index].focus({ preventScroll: true })
    const targets = [caption, list]
    const snapshots = targets.map((target) => {
      const style = getComputedStyle(target)
      return { opacity: style.opacity, transform: style.transform }
    })
    cancelAnimations()
    if (reducedMotion.matches) {
      renderSeason()
    } else {
      const outgoing = targets.map((target, i) =>
        target.animate([snapshots[i], { opacity: 0, transform: 'translateY(-6px)' }], {
          duration: 130,
          easing: 'ease-in',
          fill: 'forwards',
        }),
      )
      animations = outgoing
      try {
        await Promise.all(outgoing.map((animation) => animation.finished))
      } catch {
        return
      }
      if (currentRevision !== revision) return
      renderSeason()
      cancelAnimations()
      const incoming = targets.map((target) =>
        target.animate(
          [
            { opacity: 0, transform: 'translateY(9px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' },
        ),
      )
      animations = incoming
      try {
        await Promise.all(incoming.map((animation) => animation.finished))
      } catch {
        return
      }
      if (currentRevision !== revision) return
      cancelAnimations()
    }
    document.querySelector('#announcement').textContent =
      `${today.getFullYear()} 年${seasons[index].character}季，${seasons[index].tracks.length} 首示例歌曲`
  }

  function updatePlayer() {
    const [title, artist] = seasons[player.season].tracks[player.track]
    document.querySelector('#player-title').textContent = title
    document.querySelector('#player-artist').textContent = artist
    document
      .querySelector('#player-cover')
      .style.setProperty('--cover-art', coverArt(player.season, player.track))
    const toggle = document.querySelector('#player-toggle')
    toggle.setAttribute('aria-pressed', String(playing))
    toggle.setAttribute('aria-label', playing ? '预览暂停，无音频' : '预览播放，无音频')
    toggle.replaceChildren(icon(playing ? 'pause' : 'play'))
    updateTrackSelection()
  }
  function previewTrack(seasonIndex, trackIndex) {
    playing = player.season === seasonIndex && player.track === trackIndex ? !playing : true
    player = { season: seasonIndex, track: trackIndex }
    updatePlayer()
  }
  function skipTrack(step) {
    const length = seasons[player.season].tracks.length
    player.track = (player.track + step + length) % length
    updatePlayer()
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectSeason(index))
    tab.addEventListener('keydown', (event) => {
      const next =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? selected + 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? selected - 1
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? 3
                : null
      if (next !== null) {
        event.preventDefault()
        selectSeason(next, true)
      }
    })
  })
  document
    .querySelector('#previous-season')
    .addEventListener('click', () => selectSeason(selected - 1))
  document.querySelector('#next-season').addEventListener('click', () => selectSeason(selected + 1))
  document.querySelector('#play-all').addEventListener('click', () => {
    player = { season: selected, track: 0 }
    playing = true
    updatePlayer()
  })
  document.querySelector('#player-toggle').addEventListener('click', () => {
    playing = !playing
    updatePlayer()
  })
  document.querySelector('#player-previous').addEventListener('click', () => skipTrack(-1))
  document.querySelector('#player-next').addEventListener('click', () => skipTrack(1))
  document.querySelector('#theme-toggle').addEventListener('click', (event) => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
    const button = event.currentTarget
    const label = root.dataset.theme === 'dark' ? '切换为浅色主题' : '切换为深色主题'
    button.setAttribute('aria-label', label)
    button.title = label
    button.replaceChildren(icon(root.dataset.theme === 'dark' ? 'sun' : 'moon'))
  })
  function settleTransition() {
    if (!animations.length) return
    revision++
    cancelAnimations()
    renderSeason()
  }
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) settleTransition()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) settleTransition()
  })
  document.querySelector('#dial-year').textContent = String(today.getFullYear())
  updateSelection()
  renderSeason()
  updatePlayer()
})()
