(() => {
  'use strict'
  // Fictional listening counts and abstract cover stickers. No user-library access.
  const days = [
    { date: '2026.10.01', week: '星期四', color: '#425866', art: ['#b78772','#b7c1b6'], albums: [['In Rainbows',16],['Vespertine',12],['Mezzanine',9],['Dummy',7],['Moon Safari',5]] },
    { date: '2026.10.02', week: '星期五', color: '#4e5b69', art: ['#bcbfcb','#584e82'], albums: [['周杰伦的床边故事',19],['范特西',15],['叶惠美',11],['七里香',8],['十一月的萧邦',6]] },
    { date: '2026.10.03', week: '星期六', color: '#45646b', art: ['#ced0b8','#79836a'], albums: [['For Emma, Forever Ago',14],['Carrie & Lowell',11],['Pink Moon',8],['Either/Or',7],['Blue',4]] },
    { date: '2026.10.04', week: '星期日', color: '#495667', art: ['#cc8372','#dec39a'], albums: [['Random Access Memories',22],['Discovery',17],['Homework',10],['Cross',8],['Woman',5]] },
    { date: '2026.10.05', week: '星期一', color: '#4b5c58', art: ['#89a2ad','#cccfb8'], albums: [['A Moon Shaped Pool',13],['OK Computer',12],['Kid A',10],['The Bends',7],['Amnesiac',5]] },
    { date: '2026.10.06', week: '星期二', color: '#575966', art: ['#a58c96','#c9bfc3'], albums: [['寓言',18],['浮躁',14],['只爱陌生人',10],['将爱',8],['天空',6]] },
    { date: '2026.10.07', week: '星期三', color: '#435564', art: ['#b0c4c9','#5e778a'], albums: [['Selected Ambient Works 85–92',15],['Music for Airports',12],['Untrue',9],['Dive',7],['Immunity',5]] }
  ]
  const $ = id => document.getElementById(id)
  const rack = $('disk-rack'), strip = $('date-strip'), terminal = $('crt')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let selected = 0, inserted = null, phase = 'idle', generation = 0, animation = null
  let pendingTimer = null, pendingResolve = null, ghost = null
  const disks = [], dateButtons = []
  const cube = $('computer-cube')
  const pitchMin = -50, pitchMax = -8
  let yaw = -23, pitch = -16, drag = null, blockClickUntil = 0
  const mechanical = () => phase === 'inserting' || phase === 'ejecting'
  const normalizeYaw = value => ((value % 360) + 360) % 360
  function setView(nextYaw, nextPitch) {
    yaw = nextYaw; pitch = Math.max(pitchMin,Math.min(pitchMax,nextPitch))
    cube.style.setProperty('--yaw',`${yaw}deg`)
    cube.style.setProperty('--pitch',`${pitch}deg`)
  }
  function stopDrag() {
    if (drag && cube.hasPointerCapture(drag.id)) cube.releasePointerCapture(drag.id)
    drag = null; cube.classList.remove('is-dragging')
  }
  function frontYaw(angle = 0) { return angle + 360 * Math.round((yaw-angle)/360) }
  function setZoom(zoomed) {
    document.body.classList.toggle('zoomed',zoomed)
    $('zoom').setAttribute('aria-pressed',String(zoomed))
    $('screen-open').setAttribute('aria-pressed',String(zoomed))
    $('screen-open').setAttribute('aria-label',zoomed?'回到桌面':'近看 Mac 屏幕')
    $('zoom').firstChild.textContent = zoomed ? '回到桌面 ' : '看近一点 '
  }
  function resetView() {
    if (mechanical()) return
    stopDrag(); setZoom(false); setView(frontYaw(-23),-16)
  }
  async function faceDrive() {
    stopDrag(); setView(frontYaw(-23),-16)
    await new Promise(resolve=>setTimeout(resolve,reduced.matches?20:480))
  }
  cube.addEventListener('pointerdown',event=>{
    if (mechanical() || drag || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    drag = { id:event.pointerId,x:event.clientX,y:event.clientY,yaw,pitch,moved:false }
    // Capture only after crossing the drag threshold, so a screen tap keeps
    // its native button click and focus behavior.
    if (!event.target.closest('button')) cube.focus({preventScroll:true})
  })
  window.addEventListener('pointermove',event=>{
    if (!drag || event.pointerId !== drag.id) return
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y
    if (!drag.moved && Math.hypot(dx,dy)<6) return
    if (!drag.moved) { drag.moved=true; cube.classList.add('is-dragging'); cube.setPointerCapture(event.pointerId) }
    setView(drag.yaw+dx*.65,drag.pitch-dy*.3)
    event.preventDefault()
  },{passive:false})
  function endPointer(event) {
    if (!drag || event.pointerId !== drag.id) return
    if (drag.moved) blockClickUntil=performance.now()+350
    stopDrag()
  }
  window.addEventListener('pointerup',endPointer)
  window.addEventListener('pointercancel',endPointer)
  cube.addEventListener('lostpointercapture',event=> {
    // Touch starts with implicit capture on the tapped child. Its capture-loss
    // event bubbles when we transfer capture to the cube; the drag is still live.
    if (event.target===cube && drag && event.pointerId===drag.id) {blockClickUntil=performance.now()+350;stopDrag()}
  })
  window.addEventListener('blur',stopDrag)
  cube.addEventListener('click',event=>{
    if (performance.now()<blockClickUntil) { event.preventDefault();event.stopImmediatePropagation() }
  },true)
  $('reset-view').addEventListener('click',resetView)
  function toggleZoom() {
    if (mechanical()) return
    stopDrag()
    const zoomed=!document.body.classList.contains('zoomed')
    setZoom(zoomed)
    if (zoomed) setView(frontYaw(0),-10)
  }
  $('screen-open').addEventListener('click',toggleZoom)
  // Original geometric keyboard, authored here rather than imported hardware.
  for (let i=0;i<42;i++) { const key=document.createElement('i'); $('keyboard-keys').append(key) }
  days.forEach((day, index) => {
    const disk = document.createElement('button')
    disk.type = 'button'; disk.className = 'disk'; disk.dataset.day = index
    disk.setAttribute('aria-label', `插入 ${day.date} ${day.week}的模拟听歌软盘`)
    disk.setAttribute('aria-pressed', 'false')
    disk.style.cssText = `--order:${index};--disk-tint:${day.color};--cover-a:${day.art[0]};--cover-b:${day.art[1]}`
    disk.innerHTML = `<span class="shutter"></span><span class="disk-label"><span class="disk-date">10 / ${String(index+1).padStart(2,'0')}</span><span class="disk-meta">2026 / DAILY LISTENING</span><span class="cover-mini"></span><span class="label-album">${day.albums[0][0]}</span></span><span class="disk-notch"></span>`
    disk.addEventListener('click', () => insert(index))
    rack.append(disk); disks.push(disk)
    const button = document.createElement('button')
    button.type = 'button'; button.textContent = String(index+1).padStart(2,'0')
    button.setAttribute('aria-label', `选择并插入 ${day.date}`)
    button.addEventListener('click', () => insert(index))
    strip.append(button); dateButtons.push(button)
  })
  function cancelPending() {
    generation++
    animation?.cancel(); animation = null
    if (pendingTimer !== null) clearTimeout(pendingTimer)
    pendingTimer = null; pendingResolve?.(); pendingResolve = null
    ghost?.remove(); ghost = null
  }
  function delay(ms) {
    return new Promise(resolve => { pendingResolve = resolve; pendingTimer = setTimeout(() => { pendingTimer = null; pendingResolve = null; resolve() }, reduced.matches ? 20 : ms) })
  }
  function update(next, message) {
    phase = next; document.body.dataset.phase = phase
    $('status').textContent = message
    $('chosen-date').textContent = days[selected].date
    $('date-caption').textContent = `${days[selected].week} · ${ { idle:'等待插盘', inserting:'插盘中', reading:'读取中', ready:'已读取', ejecting:'弹出中' }[phase] }`
    $('eject').disabled = phase === 'idle' || phase === 'ejecting'
    $('zoom').disabled = $('reset-view').disabled = $('screen-open').disabled = mechanical()
    dateButtons.forEach((b,i) => b.setAttribute('aria-pressed', String(i === selected)))
    disks.forEach((d,i) => {
      d.classList.toggle('is-chosen',i === selected)
      d.classList.toggle('in-drive',i === inserted)
      d.setAttribute('aria-pressed',String(i === inserted))
    })
  }
  const menu = '<div class="screen-menu"><span>Auralis</span><span>File</span><span>Disk</span><span>1984</span></div>'
  function idleScreen() {
    terminal.innerHTML = menu + '<div class="screen-idle"><span class="disk-icon"></span><span>Insert a day.</span><small>DAILY ARCHIVE · DEMO DATA</small></div>'
    $('screen-description').textContent = 'Mac 屏幕等待插入日期软盘。所有听歌数据为模拟。'
  }
  function readingScreen(day) {
    terminal.innerHTML = menu + `<div class="screen-idle"><span class="disk-icon"></span><span>Reading ${day.date}…</span><div class="read-bar"><i></i></div><small>5 ALBUMS / SIMULATED LISTENING</small></div>`
  }
  function readyScreen(day, count) {
    terminal.innerHTML = menu + `<div class="terminal-header"><span>Daily Listening</span></div><div class="screen-date"><span>${day.date}</span><span>TOP 5 ALBUMS</span></div><ol class="screen-list">${day.albums.map((album,i) => `<li style="visibility:${i<count?'visible':'hidden'}"><b>${i+1}.</b><span title="${album[0]}">${album[0]}</span><i>${album[1]}</i></li>`).join('')}</ol><div class="screen-bottom"><span>${count}/5 RECORDS</span><span>DEMO DATA</span></div>`
  }
  async function fly(index, reverse = false) {
    const fromDisk = disks[index].getBoundingClientRect(), slot = $('drive-slot').getBoundingClientRect()
    const element = disks[index].cloneNode(true)
    element.className = 'disk flying-disk'; element.removeAttribute('aria-label'); element.tabIndex = -1
    const start = reverse ? {x:slot.x+slot.width/2-71,y:slot.y-74} : {x:fromDisk.x+fromDisk.width/2-71,y:fromDisk.y+fromDisk.height/2-78}
    const end = reverse ? {x:fromDisk.x+fromDisk.width/2-71,y:fromDisk.y+fromDisk.height/2-78} : {x:slot.x+slot.width/2-71,y:slot.y-74}
    element.style.left = '0px'; element.style.top = '0px'; element.style.setProperty('--order','0')
    $('flight-layer').append(element); ghost = element
    const frames = reverse ? [
      {transform:`translate(${start.x}px,${start.y}px) rotate(-9deg) scale(.69,.045)`,opacity:.2},
      {transform:`translate(${start.x+35}px,${start.y-20}px) rotate(-9deg) scale(.8,.55)`,opacity:1,offset:.3},
      {transform:`translate(${end.x}px,${end.y-22}px) rotate(6deg) scale(1)`,opacity:1}
    ] : [
      {transform:`translate(${start.x}px,${start.y}px) rotate(5deg) scale(1)`,opacity:1},
      {transform:`translate(${start.x-75}px,${start.y-90}px) rotate(-15deg) scale(1.05)`,opacity:1,offset:.3},
      {transform:`translate(${end.x+12}px,${end.y-8}px) rotate(-9deg) scale(.85,.4)`,opacity:1,offset:.77},
      {transform:`translate(${end.x}px,${end.y}px) rotate(-9deg) scale(.69,.045)`,opacity:0}
    ]
    const current = element.animate(frames,{duration:reduced.matches?30:(reverse?650:1000),easing:'cubic-bezier(.3,.05,.2,1)',fill:'forwards'})
    animation = current
    // A backgrounded browser can suspend its animation timeline. Finish the
    // mechanical action on elapsed time too, so its state never remains locked.
    let flightTimeout
    try {
      await Promise.race([current.finished,new Promise(resolve => { flightTimeout = setTimeout(resolve,reduced.matches?70:(reverse?750:1100)) })])
    } catch { /* A newer selection cancels this flight. */ }
    finally { clearTimeout(flightTimeout); current.cancel() }
    if (animation === current) animation = null
    element.remove(); if (ghost === element) ghost = null
  }
  async function insert(index) {
    if (index === inserted && phase === 'ready') { update('ready','这一天已经在 Mac 里。可弹出，或换一张。'); return }
    const previous = inserted
    cancelPending(); const token = generation
    selected = index
    update('inserting','盘槽转向你，准备插盘…')
    await faceDrive()
    if (token !== generation) return
    if (previous !== null && previous !== index) {
      update('ejecting',`归还 ${days[previous].date}，准备换盘…`)
      await fly(previous,true)
      if (token !== generation) return
    }
    inserted = index; update('inserting',`正在插入 ${days[index].date} 的软盘…`)
    readingScreen(days[index])
    await fly(index)
    if (token !== generation) return
    update('reading','盘片转动中，读回这一天的声音…')
    await delay(850)
    if (token !== generation) return
    for (let count=1;count<=5;count++) {
      readyScreen(days[index],count)
      await delay(105)
      if (token !== generation) return
    }
    update('ready',`${days[index].date} · 五张专辑，已读回。`)
    $('screen-description').textContent = `${days[index].date} 模拟 Top 5 专辑：${days[index].albums.map((a,i)=>`${i+1}. ${a[0]}，${a[1]}次`).join('；')}`
  }
  async function eject() {
    if (phase === 'idle') return
    const old = inserted
    cancelPending(); const token = generation
    update('ejecting','弹出软盘，放回收纳盒…'); idleScreen()
    await faceDrive()
    if (token !== generation) return
    if (old !== null) await fly(old,true)
    if (token !== generation) return
    inserted = null; update('idle','软盘已归位。再选一天，继续翻阅。')
  }
  $('eject').addEventListener('click',eject)
  $('zoom').addEventListener('click',toggleZoom)
  $('material-toggle').addEventListener('click',() => {
    const smoke = document.body.classList.toggle('smoke')
    $('material-toggle').setAttribute('aria-pressed',String(smoke))
    $('material-name').textContent = smoke ? '烟灰盒' : '冰蓝盒'
    $('box-material').textContent = smoke ? '烟灰聚碳酸酯' : '冰蓝聚碳酸酯'
  })
  document.querySelector('.wordmark').addEventListener('click',e=> {e.preventDefault();eject()})
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (cube.contains(document.activeElement) && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)) {
      event.preventDefault()
      if (mechanical()) return
      if (event.key==='Home') resetView()
      else setView(yaw+(event.key==='ArrowRight'?20:event.key==='ArrowLeft'?-20:0),pitch+(event.key==='ArrowUp'?-5:event.key==='ArrowDown'?5:0))
      return
    }
    if (event.key === 'Escape') { event.preventDefault(); eject(); return }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); const index = (selected + (event.key==='ArrowRight'?1:6)) % days.length
      dateButtons[index].focus({preventScroll:true}); insert(index)
    }
  })
  idleScreen(); update('idle','选一张软盘，读回那一天。')
  // Read-only diagnostic surface for isolated demo validation.
  window.archiveDiskboxDemo = Object.freeze({inspect:() => ({selected,inserted,phase,date:days[selected].date,top5:phase==='ready'?days[selected].albums.map(a=>a[0]):[],ghosts:$('flight-layer').children.length,view:{yaw,pitch,normalizedYaw:normalizeYaw(yaw),dragging:!!drag,zoomed:document.body.classList.contains('zoomed'),pitchMin,pitchMax}})})
})()
