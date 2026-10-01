// Generated from classic-mac.html by mac-stage-classic-build.cjs.
export function mountClassicMac(){
const crt = document.getElementById('crt')
      const crtSource = document.createElement('canvas')
      crtSource.width = 512
      crtSource.height = 342
      const VIEW_IN_MS = 1100
      const VIEW_OUT_MS = 700
      const DENOISE_MS = 1000
      const STRONG_BLUR_PX = 3.5
      const WEAK_BLUR_PX = 0.9
      const NOISE_COLS = 64
      const NOISE_ROWS = 43
      const NOISE_START_OPACITY = 0.48
      const NOISE_FRAME_COUNT = 7
      const NOISE_HZ = 13
      const PAPER = '#f3eee0'
      // Archive Screen Bitmap: GNU Unifont 16.0.04 subset, SIL OFL 1.1.
      // See assets/archive-screen-bitmap/OFL-1.1.txt and NOTICE.md.
      const SCREEN_GLYPHS = {
        "3": "000000003C4242021C020242423C0000",
        "4": "00000000040C142444447E0404040000",
        "5": "000000007E4040407C020202423C0000",
        "6": "000000001C2040407C424242423C0000",
        "7": "000000007E0202040404080808080000",
        "8": "000000003C4242423C424242423C0000",
        "9": "000000003C4242423E02020204380000",
        "0": "00000000182442464A52624224180000",
        "1": "000000000818280808080808083E0000",
        "2": "000000003C4242020C102040407E0000",
        "单": "1010082004403FF8210821083FF8210821083FF801000100FFFE010001000100",
        "曲": "04400440044004407FFC44444444444444447FFC44444444444444447FFC4004",
        "专": "0100010001003FF802000200FFFE040008000FF0001000200640018000400020",
        "辑": "200021F82108FD0841F8500097FEFD0811F811081DF8F108513E17C810081008",
        "年": "100010001FFC2080208040801FF8108010801080FFFE00800080008000800080",
        "度": "010000803FFE222022203FFC2220222023E020002FF02410422041C08630380E",
        "总": "10100820044000001FF01010101010101FF01010010008844892481287F00000",
        "结": "10201020202027FE4420F82011FC20004000FDFC410401041D04E10441FC0104",
        "F": "000000007E4040407C40404040400000",
        "i": "000000080800180808080808083E0000",
        "l": "000000180808080808080808083E0000",
        "e": "0000000000003C42427E4040423C0000",
        " ": "00000000000000000000000000000000",
        "E": "000000007E4040407C404040407E0000",
        "d": "0000000202023A4642424242463A0000",
        "t": "000000001010107C10101010100C0000",
        "V": "00000000414141222222141408080000",
        "w": "00000000000041494949494949360000",
        "S": "000000003C424240300C0242423C0000",
        "p": "0000000000005C6242424242625C4040",
        "c": "0000000000003C4240404040423C0000",
        "a": "0000000000003C42023E4242463A0000",
        ":": "00000000000018180000001818000000"
      }
      function bitmapWidth(value, gap = 0) {
        return [...value].reduce((sum, ch) => sum + SCREEN_GLYPHS[ch].length / 4 + gap, 0) - gap
      }
      function drawBitmap(ctx, value, x, y, color, gap = 0) {
        ctx.fillStyle = color
        let cursor = Math.round(x)
        for (const ch of value) {
          const hex = SCREEN_GLYPHS[ch]
          const width = hex.length / 4
          const digits = width / 4
          for (let row = 0; row < 16; row++) {
            const bits = parseInt(hex.slice(row * digits, (row + 1) * digits), 16)
            for (let col = 0; col < width; col++) {
              if (bits & (1 << (width - col - 1))) ctx.fillRect(cursor + col, y + row, 1, 1)
            }
          }
          cursor += width + gap
        }
      }
      const ENTRIES = [
        { id: 'track', label: '单曲', center: 108, icon: 'note' },
        { id: 'album', label: '专辑', center: 256, icon: 'record' },
        { id: 'year', label: '年度总结', center: 404, icon: 'report' },
      ]
      const ICON_TOP = 140
      const LABEL_TOP = 184
      const BUTTON_TOP = 130
      const BUTTON_HEIGHT = 80

      function fillPixel(ctx, color, x, y, width, height) {
        ctx.fillStyle = color
        ctx.fillRect(x, y, width, height)
      }
      // Original 32×32 monochrome icons. One logical pixel per bitmap cell.
      const ENTRY_ICONS = {
        "note": [
          "00000000",
          "00000000",
          "00000000",
          "00000000",
          "000000c0",
          "00000740",
          "000078c0",
          "00038740",
          "000c7840",
          "000b8040",
          "000c0040",
          "00080040",
          "00080040",
          "00080040",
          "00080040",
          "00080040",
          "00080040",
          "00080040",
          "00080040",
          "00080040",
          "00080fc0",
          "00083f80",
          "00083f80",
          "00080f80",
          "01f80000",
          "07f00000",
          "07f00000",
          "01f00000",
          "00000000",
          "00000000",
          "00000000",
          "00000000"
        ],
        "record": [
          "00000000",
          "00000000",
          "00000000",
          "00000000",
          "00000000",
          "1ffff000",
          "10001000",
          "10001000",
          "12001f80",
          "12001060",
          "12001010",
          "127f1008",
          "12001008",
          "12001004",
          "127c1004",
          "12001e04",
          "12001a04",
          "12001e04",
          "12001004",
          "12001008",
          "12001008",
          "12001010",
          "127f1060",
          "12001f80",
          "10001000",
          "10001000",
          "10001000",
          "1ffff000",
          "00000000",
          "00000000",
          "00000000",
          "00000000"
        ],
        "report": [
          "00000000",
          "00000000",
          "00000000",
          "01fff800",
          "01000c00",
          "01000a00",
          "01000900",
          "01000880",
          "01000fc0",
          "01000040",
          "01000040",
          "011fc040",
          "01000040",
          "01000040",
          "011f0040",
          "01000040",
          "01000640",
          "01000640",
          "0100c640",
          "0100c640",
          "0100c640",
          "0118c640",
          "0118c640",
          "0118c640",
          "0118c640",
          "013fff40",
          "01000040",
          "01000040",
          "01ffffc0",
          "00000000",
          "00000000",
          "00000000"
        ]
      }
      function drawEntryIcon(ctx, icon, x, y, selected) {
        ctx.fillStyle = selected ? '#315b91' : '#171612'
        ENTRY_ICONS[icon].forEach((hex, row) => {
          const bits = parseInt(hex, 16)
          for (let col = 0; col < 32; col++) {
            if ((bits >>> (31 - col)) & 1) ctx.fillRect(x + col, y + row, 1, 1)
          }
        })
      }
      function drawEntryLabel(ctx, entry, selected) {
        const width = bitmapWidth(entry.label, 2)
        const left = Math.round(entry.center - width / 2)
        if (selected) fillPixel(ctx, '#315b91', left - 4, LABEL_TOP - 3, width + 8, 22)
        drawBitmap(ctx, entry.label, left, LABEL_TOP, selected ? '#fffdf5' : '#171612', 2)
      }
      function drawCrt() {
        const ctx = crtSource.getContext('2d')
        ctx.imageSmoothingEnabled = false
        ctx.fillStyle = '#f3eee0'
        ctx.fillRect(0, 0, 512, 342)
        const dither = ctx.createImageData(512, 322)
        for (let i = 0; i < dither.data.length; i += 4) {
          const p = i / 4
          const x = p % 512
          const y = (p / 512) | 0
          const on = (x + y) % 2 === 0
          dither.data[i] = on ? 216 : 243
          dither.data[i + 1] = on ? 210 : 238
          dither.data[i + 2] = on ? 194 : 224
          dither.data[i + 3] = 255
        }
        ctx.putImageData(dither, 0, 20)
        ctx.fillStyle = '#f3eee0'
        ctx.fillRect(0, 0, 512, 20)
        ctx.fillStyle = '#111'
        ctx.fillRect(0, 19, 512, 1)
        drawBitmap(ctx, 'File   Edit   View   Special', 22, 1, '#111')
        ctx.fillRect(6, 5, 9, 9)
        ctx.fillStyle = '#f3eee0'
        ctx.fillRect(8, 7, 5, 5)
        ctx.fillStyle = '#111'
        const now = new Date()
        const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        drawBitmap(ctx, clock, 466, 1, '#111')
        for (const entry of ENTRIES) {
          const selected = selectedEntry === entry.id
          drawEntryIcon(ctx, entry.icon, entry.center - 16, ICON_TOP, selected)
          drawEntryLabel(ctx, entry, selected)
        }
      }
      function syncCrt() {
        drawCrt()
        const context = crt.getContext('2d')
        context.imageSmoothingEnabled = false
        context.clearRect(0, 0, crt.width, crt.height)
        context.drawImage(crtSource, 0, 0, crt.width, crt.height)
      }

      const rig = document.getElementById('rig')
      const studio = document.getElementById('studio')
      const bezelReturn = document.getElementById('bezel-return')
      const bezelPower = document.getElementById('bezel-power')
      const bodyPower = document.getElementById('body-power')
      const crtBlank = document.getElementById('crt-blank')
      const entryLayer = document.getElementById('crt-entry-layer')
      const entryButtons = [...entryLayer.querySelectorAll('.crt-entry')]
      const motion = matchMedia('(prefers-reduced-motion: reduce)')
      const glass = rig.querySelector('.crt-glass')
      const well = rig.querySelector('.crt-well')
      const fxLayer = document.getElementById('crt-fx')
      const blurWeak = document.getElementById('crt-blur-weak')
      const blurStrong = document.getElementById('crt-blur-strong')
      const noiseView = document.getElementById('crt-noise')
      const blurPad = document.createElement('canvas')
      const blurWork = document.createElement('canvas')
      const noiseFrames = []
      let selectedEntry = null
      let entriesReady = false
      let crtPowered = false
      let yaw = -32
      let pitch = -16
      let drag = null
      let suppressDoubleClickUntil = 0
      let mode = 'machine'
      let operationBusy = false
      let raf = 0
      let lastTime = 0
      let pauseUntil = 0
      let viewAnimation = null
      let denoiseAnims = []
      let noiseRaf = 0
      let denoiseLive = false
      let transitionGen = 0

      for (const entry of ENTRIES) {
        const button = entryButtons.find(item => item.dataset.entry === entry.id)
        button.style.left = `${(entry.center - 60) / 512 * 100}%`
        button.style.top = `${BUTTON_TOP / 342 * 100}%`
        button.style.width = `${120 / 512 * 100}%`
        button.style.height = `${BUTTON_HEIGHT / 342 * 100}%`
      }
      syncCrt()

      let clockTimer = 0
      function updateClock() {
        clearTimeout(clockTimer)
        if (document.hidden) return
        syncCrt()
        // Sample the machine clock again at the next minute boundary.
        clockTimer = setTimeout(updateClock, 60000 - Date.now() % 60000 + 20)
      }
      updateClock()

      function setEntriesReady(ready) {
        entriesReady = ready && mode === 'screen' && crtPowered
        entryLayer.inert = !entriesReady
        entryLayer.setAttribute('aria-hidden', String(!entriesReady))
        for (const button of entryButtons) button.disabled = !entriesReady
      }

      function setPowerPressed(on) {
        bezelPower.setAttribute('aria-pressed', String(on))
      }

      function syncBezel() {
        const onScreen = mode === 'screen'
        const busy = Boolean(viewAnimation) || denoiseLive
        bezelReturn.tabIndex = onScreen ? 0 : -1
        bezelPower.disabled = !onScreen || crtPowered || busy
        setPowerPressed(crtPowered)
        bodyPower.disabled = onScreen || busy
        bodyPower.tabIndex = onScreen || busy ? -1 : 0
        bodyPower.setAttribute('aria-pressed', String(crtPowered))
      }

      function setBlank(opacity) {
        for (const anim of crtBlank.getAnimations()) {
          try { anim.commitStyles() } catch {}
          anim.cancel()
        }
        crtBlank.style.opacity = String(opacity)
      }

      function selectEntry(id) {
        if (!entriesReady || mode !== 'screen') return
        selectedEntry = id
        document.dispatchEvent(new CustomEvent('mac-entry-selected', {detail:{id}}))
        for (const button of entryButtons) button.setAttribute('aria-pressed', String(button.dataset.entry === id))
        syncCrt()
      }

      function prepareCrt(scale) {
        const factor = Math.max(1, Math.ceil(glass.offsetWidth * scale * (devicePixelRatio || 1) / crtSource.width))
        const width = crtSource.width * factor
        const height = crtSource.height * factor
        if (crt.width !== width || crt.height !== height) {
          crt.width = width
          crt.height = height
        }
        const context = crt.getContext('2d')
        context.imageSmoothingEnabled = false
        context.drawImage(crtSource, 0, 0, crt.width, crt.height)
      }

      function transitionBusy() {
        return Boolean(viewAnimation) || denoiseLive
      }

      function paintBlurred(target, radius) {
        const pad = Math.ceil(radius * 3) + 4
        const width = crtSource.width
        const height = crtSource.height
        blurPad.width = width + pad * 2
        blurPad.height = height + pad * 2
        const padded = blurPad.getContext('2d')
        padded.fillStyle = PAPER
        padded.fillRect(0, 0, blurPad.width, blurPad.height)
        padded.drawImage(crtSource, pad, pad)
        padded.drawImage(crtSource, 0, 0, width, 1, pad, 0, width, pad)
        padded.drawImage(crtSource, 0, height - 1, width, 1, pad, pad + height, width, pad)
        padded.drawImage(crtSource, 0, 0, 1, height, 0, pad, pad, height)
        padded.drawImage(crtSource, width - 1, 0, 1, height, pad + width, pad, pad, height)
        blurWork.width = blurPad.width
        blurWork.height = blurPad.height
        const work = blurWork.getContext('2d')
        work.filter = `blur(${radius}px)`
        work.drawImage(blurPad, 0, 0)
        work.filter = 'none'
        if (target.width !== width) target.width = width
        if (target.height !== height) target.height = height
        const dest = target.getContext('2d')
        dest.imageSmoothingEnabled = true
        dest.clearRect(0, 0, width, height)
        dest.drawImage(blurWork, pad, pad, width, height, 0, 0, width, height)
      }

      function ensureNoiseFrames() {
        if (noiseFrames.length) return
        for (let i = 0; i < NOISE_FRAME_COUNT; i++) {
          const frame = document.createElement('canvas')
          frame.width = NOISE_COLS
          frame.height = NOISE_ROWS
          const context = frame.getContext('2d')
          const pixels = context.createImageData(NOISE_COLS, NOISE_ROWS)
          const data = pixels.data
          for (let p = 0; p < data.length; p += 4) {
            const grain = Math.random()
            if (grain > 0.82) continue
            const light = grain > 0.4
            data[p] = light ? 232 : 96
            data[p + 1] = light ? 224 : 88
            data[p + 2] = light ? 204 : 72
            data[p + 3] = light ? 88 + ((grain * 52) | 0) : 108 + ((grain * 52) | 0)
          }
          context.putImageData(pixels, 0, 0)
          noiseFrames.push(frame)
        }
      }

      function paintNoise(index) {
        const context = noiseView.getContext('2d')
        context.clearRect(0, 0, noiseView.width, noiseView.height)
        context.drawImage(noiseFrames[index], 0, 0)
      }

      function clearDenoise() {
        denoiseLive = false
        if (noiseRaf) {
          cancelAnimationFrame(noiseRaf)
          noiseRaf = 0
        }
        blurWeak.style.opacity = '0'
        blurStrong.style.opacity = '0'
        noiseView.style.opacity = '0'
        fxLayer.classList.remove('is-live')
        for (const anim of denoiseAnims) anim.cancel()
        denoiseAnims = []
        blurWeak.style.willChange = ''
        blurStrong.style.willChange = ''
        noiseView.style.willChange = ''
      }

      function armDenoise() {
        ensureNoiseFrames()
        paintBlurred(blurWeak, WEAK_BLUR_PX)
        paintBlurred(blurStrong, STRONG_BLUR_PX)
        paintNoise(0)
        blurWeak.style.opacity = '1'
        blurStrong.style.opacity = '1'
        noiseView.style.opacity = String(NOISE_START_OPACITY)
        blurWeak.style.willChange = 'opacity'
        blurStrong.style.willChange = 'opacity'
        noiseView.style.willChange = 'opacity'
        fxLayer.classList.add('is-live')
        denoiseLive = true
      }

      function startNoiseLoop(gen) {
        let index = 0
        let last = 0
        const interval = 1000 / NOISE_HZ
        const tick = now => {
          if (gen !== transitionGen || !denoiseLive) return
          if (!last) last = now
          if (now - last >= interval) {
            last = now
            index = (index + 1) % noiseFrames.length
            paintNoise(index)
          }
          noiseRaf = requestAnimationFrame(tick)
        }
        noiseRaf = requestAnimationFrame(tick)
      }

      function startDenoise(gen) {
        if (gen !== transitionGen || mode !== 'screen' || !denoiseLive) return
        const timing = { duration: DENOISE_MS, fill: 'forwards', easing: 'linear' }
        denoiseAnims = [
          blurStrong.animate([
            { opacity: 1, offset: 0, easing: 'ease-out' },
            { opacity: 0.92, offset: 0.18, easing: 'ease-in-out' },
            { opacity: 0.08, offset: 0.55, easing: 'ease-out' },
            { opacity: 0, offset: 0.7 },
            { opacity: 0, offset: 1 },
          ], timing),
          blurWeak.animate([
            { opacity: 1, offset: 0, easing: 'ease-out' },
            { opacity: 1, offset: 0.18, easing: 'ease-in-out' },
            { opacity: 0.82, offset: 0.55, easing: 'ease-out' },
            { opacity: 0.28, offset: 0.7, easing: 'ease-out' },
            { opacity: 0.1, offset: 0.85, easing: 'ease-out' },
            { opacity: 0, offset: 1 },
          ], timing),
          noiseView.animate([
            { opacity: NOISE_START_OPACITY, offset: 0, easing: 'linear' },
            { opacity: 0.46, offset: 0.18, easing: 'linear' },
            { opacity: 0.42, offset: 0.4, easing: 'ease-out' },
            { opacity: 0.18, offset: 0.55, easing: 'ease-out' },
            { opacity: 0.08, offset: 0.7, easing: 'ease-out' },
            { opacity: 0.03, offset: 0.85, easing: 'ease-out' },
            { opacity: 0, offset: 1 },
          ], timing),
        ]
        startNoiseLoop(gen)
        Promise.all(denoiseAnims.map(anim => anim.finished.catch(() => {}))).then(() => {
          if (gen !== transitionGen || mode !== 'screen') return
          finishScreenOn(gen)
        })
      }

      function finishScreenOn(gen) {
        if (gen !== transitionGen || mode !== 'screen') return
        crtPowered = true
        syncCrt()
        setBlank(0)
        clearDenoise()
        pauseSky(false)
        rig.classList.remove('is-transitioning')
        syncBezel()
        setEntriesReady(true)
        startRotation()
      }

      function settleNow() {
        const wasDenoising = denoiseLive
        const waiting = mode === 'screen' && !crtPowered && !wasDenoising && !motion.matches
        transitionGen += 1
        viewAnimation?.cancel()
        viewAnimation = null
        clearDenoise()
        pauseSky(false)
        rig.classList.remove('is-transitioning')
        if (mode === 'screen' && (wasDenoising || crtPowered || motion.matches)) {
          crtPowered = true
          setBlank(0)
        } else {
          setBlank(crtPowered ? 0 : 1)
        }
        layout()
        syncBezel()
        setEntriesReady(mode === 'screen')
        startRotation()
      }

      function layout() {
        const focused = mode === 'screen'
        const chromeX = well.offsetLeft + glass.offsetLeft
        const frontW = glass.offsetWidth + chromeX * 2
        let scale = focused
          ? Math.min((innerWidth - 96) / frontW, (innerHeight - 80) / glass.offsetHeight)
          : Math.min((studio.clientWidth - 24) / 660, (studio.clientHeight - 24) / 760, 1)
        if (focused) {
          const dpr = devicePixelRatio || 1
          scale = Math.max(1 / glass.offsetWidth, Math.floor(glass.offsetWidth * scale * dpr) / (glass.offsetWidth * dpr))
        }
        const centerX = well.offsetLeft + glass.offsetLeft + glass.offsetWidth / 2
        const centerY = well.offsetTop + glass.offsetTop + glass.offsetHeight / 2
        rig.style.setProperty('--zoom', scale)
        rig.style.setProperty('--move-x', `${focused ? (rig.offsetWidth / 2 - centerX) * scale : 0}px`)
        rig.style.setProperty('--move-y', `${focused ? (rig.offsetHeight / 2 - centerY) * scale : -12}px`)
        rig.style.setProperty('--move-z', `${focused ? -170 * scale : 0}px`)
        rig.style.setProperty('--tilt-x', `${focused ? 0 : pitch}deg`)
        rig.style.setProperty('--tilt-y', `${yaw}deg`)
        if (focused) prepareCrt(scale)
      }

      function frame(time) {
        const elapsed = lastTime ? Math.min(time - lastTime, 250) : 0
        lastTime = time
        if (time >= pauseUntil) {
          yaw += elapsed * 360 / 60000
          rig.style.setProperty('--tilt-y', `${yaw}deg`)
          document.dispatchEvent(new CustomEvent('mac-view-geometry'))
        }
        raf = requestAnimationFrame(frame)
      }

      function stopRotation() { cancelAnimationFrame(raf); raf = 0; lastTime = 0 }
      function startRotation() {
        if (mode !== 'machine' || operationBusy || drag || transitionBusy() || motion.matches || document.hidden || raf) return
        raf = requestAnimationFrame(frame)
      }
      function pauseSky(active) {
        document.dispatchEvent(new CustomEvent('mac-view-transition', { detail: { active } }))
      }
      function powerOnMachine() {
        if (mode !== 'machine' || crtPowered || viewAnimation) return
        crtPowered = true
        drawCrt()
        setBlank(0)
        syncBezel()
      }

      function powerOn() {
        if (mode !== 'screen' || crtPowered || viewAnimation || denoiseLive || motion.matches) return
        drawCrt()
        armDenoise()
        setBlank(0)
        pauseSky(true)
        syncBezel()
        startDenoise(transitionGen)
      }

      function setMode(next) {
        if (mode === next) return
        endDrag()
        stopRotation()
        const before = getComputedStyle(rig).transform
        const gen = ++transitionGen
        viewAnimation?.cancel()
        viewAnimation = null
        clearDenoise()
        pauseSky(true)
        mode = next
        if (next === 'machine') pitch = -16
        yaw = Math.round(yaw / 360) * 360 + (next === 'machine' ? -32 : 0)
        rig.classList.add('is-transitioning')
        studio.classList.toggle('screen-mode', next === 'screen')
        document.body.classList.toggle('mac-screen-mode', next === 'screen')
        document.dispatchEvent(new CustomEvent('mac-mode-change', {detail:{mode:next}}))
        rig.tabIndex = next === 'screen' ? -1 : 0
        if (next === 'screen' && motion.matches) crtPowered = true
        setEntriesReady(false)
        if (next === 'screen') drawCrt()
        setBlank(crtPowered ? 0 : 1)
        layout()
        const after = getComputedStyle(rig).transform
        if (next === 'screen') bezelReturn.focus({ preventScroll: true })
        else rig.focus({ preventScroll: true })
        const duration = motion.matches ? 0 : (next === 'screen' ? VIEW_IN_MS : VIEW_OUT_MS)
        const animation = rig.animate([{ transform: before }, { transform: after }], {
          duration,
          easing: next === 'screen' ? 'cubic-bezier(0.4, 0, 0.2, 1)' : 'cubic-bezier(0.16, 1, 0.3, 1)',
        })
        viewAnimation = animation
        syncBezel()
        animation.finished.then(() => {
          if (gen !== transitionGen || viewAnimation !== animation) return
          viewAnimation = null
          rig.classList.remove('is-transitioning')
          pauseSky(false)
          if (next === 'screen' && !crtPowered) {
            setBlank(1)
            syncBezel()
            bezelPower.focus({ preventScroll: true })
            return
          }
          if (next === 'screen') {
            finishScreenOn(gen)
            return
          }
          setBlank(crtPowered ? 0 : 1)
          syncBezel()
          startRotation()
        }).catch(() => {})
      }
      rig.addEventListener('dblclick', event => {
        if (!event.target.closest('button, select, .terminal-ui, .floppy') && event.button === 0 && performance.now() >= suppressDoubleClickUntil) { event.preventDefault(); setMode('screen') }
      })
      function endDrag(event) {
        if (!drag || (event && event.pointerId !== drag.id)) return
        const ended = drag
        drag = null
        rig.classList.remove('is-dragging')
        if (rig.hasPointerCapture(ended.id)) rig.releasePointerCapture(ended.id)
        if (ended.moved) suppressDoubleClickUntil = performance.now() + 400
        pauseUntil = performance.now() + 1500
        startRotation()
      }
      rig.addEventListener('pointerdown', event => {
        if (event.button !== 0 || mode !== 'machine' || operationBusy || transitionBusy() || drag || event.target.closest('button, select, .terminal-ui, .floppy')) return
        stopRotation()
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, moved: false }
        rig.setPointerCapture(event.pointerId)
        rig.classList.add('is-dragging')
        event.preventDefault()
      })
      rig.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (!drag.moved && Math.hypot(dx, dy) < 4) return
        drag.moved = true
        yaw = drag.yaw + dx * 0.45
        pitch = Math.max(-55, Math.min(35, drag.pitch - dy * 0.3))
        rig.style.setProperty('--tilt-y', `${yaw}deg`)
        rig.style.setProperty('--tilt-x', `${pitch}deg`)
        document.dispatchEvent(new CustomEvent('mac-view-geometry'))
      })
      rig.addEventListener('pointerup', endDrag)
      rig.addEventListener('pointercancel', endDrag)
      rig.addEventListener('lostpointercapture', endDrag)
      addEventListener('blur', () => endDrag())
      rig.addEventListener('keydown', event => {
        if (event.target !== rig) return
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setMode('screen') }
      })
      for (const button of entryButtons) {
        button.addEventListener('click', event => {
          event.stopPropagation()
          selectEntry(button.dataset.entry)
        })
        button.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
        })
      }
      glass.addEventListener('click', event => {
        if (!entriesReady || mode !== 'screen' || event.target.closest('.crt-entry, .terminal-ui')) return
        if (selectedEntry === null) return
        selectedEntry = null
        for (const button of entryButtons) button.setAttribute('aria-pressed', 'false')
        syncCrt()
      })
      bezelReturn.addEventListener('click', event => {
        event.stopPropagation()
        setMode('machine')
      })
      bezelPower.addEventListener('click', event => {
        event.stopPropagation()
        powerOn()
      })
      bodyPower.addEventListener('pointerdown', event => event.stopPropagation())
      bodyPower.addEventListener('click', event => {
        event.stopPropagation()
        powerOnMachine()
      })
      for (const button of [bezelReturn, bezelPower, bodyPower]) {
        button.addEventListener('dblclick', event => event.stopPropagation())
        button.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
        })
      }
      addEventListener('keydown', event => { if (event.key === 'Escape') setMode('machine') })
      addEventListener('resize', () => {
        endDrag()
        settleNow()
      })
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          settleNow()
          stopRotation()
          return
        }
        updateClock()
        pauseSky(false)
        setEntriesReady(mode === 'screen')
        syncBezel()
        startRotation()
      })
      motion.addEventListener('change', () => {
        settleNow()
        stopRotation()
        startRotation()
      })
      ensureNoiseFrames()
      layout()
      syncBezel()
      startRotation()
    
      document.addEventListener('mac-operation-busy',event=>{operationBusy=!!event.detail?.busy;if(operationBusy){endDrag();stopRotation()}else startRotation()});
      document.addEventListener('mac-desktop-return',()=>{glass.classList.remove('mac-album-open');selectedEntry=null;for(const b of entryButtons)b.setAttribute('aria-pressed','false');syncCrt();});
      const resizeObserver=new ResizeObserver(()=>{if(mode==='machine'&&!drag&&!transitionBusy())layout()});resizeObserver.observe(studio);
      addEventListener('pagehide',()=>{resizeObserver.disconnect();stopRotation();clearTimeout(clockTimer);transitionGen++;viewAnimation?.cancel();clearDenoise();pauseSky(false)},{once:true});
      return {inspect:()=>({mode,yaw,pitch,powered:crtPowered,entriesReady,busy:transitionBusy(),operationBusy}),setMode};
}
