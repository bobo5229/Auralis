import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

app.setPath('userData', process.env.CARD_BACKGROUND_PROFILE)
const verify = process.env.CARD_BACKGROUND_VERIFY === '1'
const compare = process.env.CARD_BACKGROUND_COMPARE === '1'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let prototypeWindow
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 820,
      minHeight: 720,
      show: false,
      autoHideMenuBar: true,
      title: 'Auralis · 闪卡底图原型',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    prototypeWindow = win
    win.on('closed', () => {
      prototypeWindow = null
    })
    const errors = []
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message)
    })
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error(details)
      app.exit(1)
    })
    await win.loadURL(process.env.CARD_BACKGROUND_URL)
    win.show()
    if (verify || compare) win.setPosition(-12000, -12000)
    if (!verify && !compare) {
      await pause(500)
      win.focus()
      console.log(
        `原型窗口已显示：${prototypeWindow.getTitle()}；visible=${prototypeWindow.isVisible()}`,
      )
    }
    if (!verify && !compare) return
    try {
      const js = (code) => win.webContents.executeJavaScript(code)
      for (let i = 0; i < 80 && !(await js('document.body.dataset.ready === "true"')); i++)
        await pause(100)
      assert.equal(
        await js('document.body.dataset.ready'),
        'true',
        await js('document.querySelector("#status").textContent'),
      )
      const output = process.env.CARD_BACKGROUND_OUTPUT
      await mkdir(output, { recursive: true })
      const capture = async (name, region) => {
        await pause(450)
        for (let attempt = 0; attempt < 5; attempt++) {
          const bitmap = await win.capturePage(region)
          if (!bitmap.isEmpty()) {
            await writeFile(join(output, `${name}.png`), bitmap.toPNG())
            return
          }
          await pause(150)
        }
        throw Error(`Empty native capture: ${name}`)
      }
      const click = async (selector) => {
        win.focus()
        await js(
          `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`,
        )
        await js(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        )
        await pause(80)
        const rect = await js(
          `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`,
        )
        win.webContents.sendInputEvent({
          type: 'mouseDown',
          button: 'left',
          clickCount: 1,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        })
        win.webContents.sendInputEvent({
          type: 'mouseUp',
          button: 'left',
          clickCount: 1,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        })
        await pause(150)
      }
      if (compare) {
        win.setSize(1800, 1380)
        await click('[data-view="all"]')
        win.webContents.sendInputEvent({ type: 'mouseMove', x: 10, y: 10 })
        await capture('comparison-rest')
        await click('#foil')
        await capture('comparison-print')
        await click('#foil')
        const styles = ['glass', 'metal', 'tunnel', 'aurora', 'paper', 'terrain', 'flow']
        const labels = []
        for (const id of styles) {
          await click(`[data-view="${id}"]`)
          labels.push(await js('document.querySelector(".caption strong").textContent'))
          const region = await js(
            '(() => { const r = document.querySelector("#stage").getBoundingClientRect(); const w = Math.ceil(r.height * .85); return {x:Math.round(r.x+r.width/2-w/2),y:Math.round(r.y),width:w,height:Math.floor(r.height)} })()',
          )
          win.webContents.sendInputEvent({ type: 'mouseMove', x: 10, y: 10 })
          await capture(`${id}-rest`, region)
          const point = await js(
            '(() => { const r = document.querySelector("#stage").getBoundingClientRect(); return {x:r.x+r.width/2+85,y:r.y+r.height/2-90} })()',
          )
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(point.x),
            y: Math.round(point.y),
          })
          await capture(`${id}-hover`, region)
          assert.equal(await js('document.querySelectorAll(".caption").length'), 1)
        }
        await click('[data-view="all"]')
        win.webContents.sendInputEvent({ type: 'mouseMove', x: 10, y: 10 })
        await capture('comparison-rest')
        assert.equal(errors.length, 0, errors.join('\n'))
        const preview = await js(
          'JSON.parse(document.querySelector("#preview-config").textContent)',
        )
        const escape = (value) =>
          String(value).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
          )
        await writeFile(
          join(output, 'compare.html'),
          `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>七种闪卡底图对照</title>
<style>body{margin:32px auto;padding:0 24px;max-width:1440px;background:#11151d;color:#e6e9ef;font:15px/1.6 system-ui}h1{font-size:24px}p{color:#aab5c3}button,a{color:inherit}button{border:1px solid #61728a;background:#1c2532;border-radius:6px;padding:8px 20px;cursor:pointer;margin-right:8px}button[aria-pressed=true]{background:#38546c}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-top:24px}figure{margin:0}img{width:100%;display:block;cursor:zoom-in}figcaption{text-align:center}dialog{padding:0;border:1px solid #61728a;background:#11151d}dialog::backdrop{background:#000c}dialog img{width:auto;max-width:90vw;max-height:90vh;cursor:zoom-out}</style>
<h1>七种底图，同一张真实封面</h1><p>${escape(preview.title)} · ${escape(preview.artist)} · 相同图案种子、封面与姿态；点击卡片放大。</p>
<nav><button data-pose="rest" aria-pressed="true">静止构图</button><button data-pose="hover" aria-pressed="false">倾斜闪光</button><a href="comparison-print.png">查看无闪膜总览</a></nav><main>${styles.map((id, i) => `<figure><img data-style="${id}" src="${id}-rest.png" alt="${escape(labels[i])}"></figure>`).join('')}</main><dialog><img alt="放大卡面"></dialog>
<script>const dialog=document.querySelector('dialog');document.querySelectorAll('[data-pose]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-pose]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('[data-style]').forEach(img=>img.src=img.dataset.style+'-'+button.dataset.pose+'.png')});document.querySelectorAll('[data-style]').forEach(img=>img.onclick=()=>{dialog.querySelector('img').src=img.src;dialog.showModal()});dialog.onclick=()=>dialog.close();</script></html>`,
        )
        const report = {
          styles,
          preview,
          composition: await js('JSON.parse(document.body.dataset.composition)'),
          errors,
          checks: [
            'same decoded local cover',
            'fixed seed',
            'seven production card renderers',
            'rest and print-only comparison',
            'seven native hover captures',
          ],
        }
        // Exercise the delivered local comparison page, including its actual
        // image loads, pose switch and zoom interaction.
        await Promise.race([
          win.loadFile(join(output, 'compare.html')),
          pause(5000).then(() => {
            throw Error('Comparison page navigation timed out')
          }),
        ])
        // Force a viewport paint after navigating the offscreen native window.
        win.setSize(1801, 1380)
        await pause(100)
        win.setSize(1800, 1380)
        const waitForImages = async () => {
          for (let attempt = 0; attempt < 50; attempt++) {
            if (
              await js(
                'Array.from(document.querySelectorAll("[data-style]")).every(img => img.complete && img.naturalWidth > 0)',
              )
            )
              return
            await pause(100)
          }
          throw Error(
            'Comparison images failed to load: ' +
              (await js(
                'JSON.stringify(Array.from(document.querySelectorAll("[data-style]"), img => ({src:img.src, complete:img.complete, width:img.naturalWidth})))',
              )),
          )
        }
        await waitForImages()
        await capture('comparison-details')
        await click('[data-pose="hover"]')
        await waitForImages()
        assert.equal(
          await js(
            'Array.from(document.querySelectorAll("[data-style]")).filter(img => img.src.endsWith("-hover.png")).length',
          ),
          7,
        )
        await capture('comparison-hover')
        await click('[data-style="glass"]')
        assert.equal(await js('document.querySelector("dialog").open'), true)
        await click('dialog img')
        assert.equal(await js('document.querySelector("dialog").open'), false)
        assert.equal(errors.length, 0, errors.join('\n'))
        report.checks.push(
          'local comparison images load',
          'pose switch changes all seven cards',
          'zoom opens and closes',
        )
        await writeFile(
          join(output, 'comparison-verification.json'),
          JSON.stringify(report, null, 2),
        )
        console.log(`七种真实封面对照完成：${output}`)
        app.quit()
        return
      }
      assert.equal(await js('document.querySelectorAll(".caption").length'), 3)
      await capture('new-studies')
      await click('[data-view="all"]')
      assert.equal(await js('document.querySelectorAll(".caption").length'), 7)
      await capture('comparison')
      for (const id of ['glass', 'metal', 'tunnel', 'aurora', 'paper', 'terrain', 'flow']) {
        await click(`[data-view="${id}"]`)
        assert.equal(await js('document.querySelectorAll(".caption").length'), 1)
        await capture(id)
        if (id === 'glass') {
          const point = await js(
            '(() => { const r = document.querySelector("#stage").getBoundingClientRect(); return { x: r.x+r.width/2+100, y: r.y+r.height/2-110 } })()',
          )
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(point.x),
            y: Math.round(point.y),
          })
          await capture('glass-hover')
          await click('#coating')
          assert.equal(
            await js('document.querySelector("#coating").getAttribute("aria-pressed")'),
            'false',
          )
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(point.x),
            y: Math.round(point.y),
          })
          await capture('glass-hover-original')
          await click('#coating')
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(point.x),
            y: Math.round(point.y),
          })
          await capture('glass-hover-enhanced')
          win.webContents.sendInputEvent({ type: 'mouseMove', x: 10, y: 10 })
        }
      }
      await click('[data-view="metal"]')
      const stage = await js(
        '(() => { const r = document.querySelector("#stage").getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height} })()',
      )
      const coverRect = {
        x: Math.round(stage.x + stage.w / 2 - 80),
        y: Math.round(stage.y + stage.h * 0.23),
        width: 160,
        height: 160,
      }
      const inkRect = {
        x: Math.round(stage.x + stage.w / 2 - 110),
        y: Math.round(stage.y + stage.h * 0.6),
        width: 220,
        height: Math.round(stage.h * 0.27),
      }
      const sample = async (rect) => {
        await pause(500)
        return (await win.capturePage(rect)).toBitmap()
      }
      const enhancedCover = await sample(coverRect)
      const enhancedInk = await sample(inkRect)
      await click('#coating')
      const originalCover = await sample(coverRect)
      assert.deepEqual(
        enhancedCover,
        originalCover,
        'Cover appearance must remain identical at rest',
      )
      await click('#coating')
      await click('#foil')
      const plainInk = await sample(inkRect)
      await js('document.dispatchEvent(new CustomEvent("card-study-print-mask", {detail:true}))')
      const glyphMask = await sample(inkRect)
      await js('document.dispatchEvent(new CustomEvent("card-study-print-mask", {detail:false}))')
      assert.equal(enhancedInk.length, plainInk.length)
      assert.equal(glyphMask.length, plainInk.length)
      let textPixels = 0,
        textDifference = 0,
        backgroundPixels = 0,
        backgroundDifference = 0
      for (let i = 0; i < plainInk.length; i += 4) {
        const channels = [0, 1, 2].map((channel) => plainInk[i + channel])
        if (glyphMask[i + 1] > 240 && glyphMask[i] < 10 && glyphMask[i + 2] < 10) {
          textPixels++
          textDifference += Math.max(
            ...channels.map((value, channel) => Math.abs(enhancedInk[i + channel] - value)),
          )
        }
        if (Math.max(...channels) < 150 && glyphMask[i + 1] < 10 && glyphMask[i + 2] < 10) {
          backgroundPixels++
          backgroundDifference +=
            channels.reduce(
              (sum, value, channel) => sum + Math.abs(enhancedInk[i + channel] - value),
              0,
            ) / 3
        }
        for (let channel = 0; channel < 3; channel++)
          assert.ok(
            enhancedInk[i + channel] <=
              plainInk[i + channel] + (255 - plainInk[i + channel]) * 0.16 + 3,
            'Foil exceeded brightness budget',
          )
      }
      assert.ok(textPixels > 10, 'Sample must contain actual printed glyphs')
      assert.ok(textDifference / textPixels < 3, 'Printed text should remain protected')
      assert.ok(
        backgroundPixels > 100 && backgroundDifference / backgroundPixels > 2,
        'Dark background must show foil',
      )
      await writeFile(
        join(output, 'foil-measurements.json'),
        JSON.stringify(
          {
            coverIdentical: true,
            textPixels,
            textMeanDifference: textDifference / textPixels,
            backgroundMeanDifference: backgroundDifference / backgroundPixels,
            brightnessBudget: 0.16,
          },
          null,
          2,
        ),
      )
      await click('#foil')
      await click('[data-view="all"]')
      await click('#foil')
      assert.equal(
        await js('document.querySelector("#foil").getAttribute("aria-pressed")'),
        'false',
      )
      await capture('comparison-no-foil')
      await click('#theme')
      await capture('comparison-light')
      win.setSize(820, 720)
      await capture('small')
      await click('[data-view="recent"]')
      assert.equal(await js('document.querySelectorAll(".caption").length'), 3)
      await capture('new-studies-small')
      await js('window.scrollTo(0, document.documentElement.scrollHeight)')
      await capture('new-studies-small-bottom')
      await js('window.scrollTo(0, 0)')
      // Exercise the real file-input change path with an isolated generated image.
      assert.equal(
        await js(`(async () => {
      const c = document.createElement('canvas'); c.width = 500; c.height = 320;
      const x = c.getContext('2d'); x.fillStyle = '#bc6548'; x.fillRect(0,0,500,320);
      const blob = await new Promise(resolve => c.toBlob(resolve));
      const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'test-cover.png', {type:'image/png'}));
      const input = document.querySelector('#cover'); input.files = transfer.files;
      input.dispatchEvent(new Event('change')); return true;
    })()`),
        true,
      )
      await pause(400)
      assert.match(await js('document.querySelector("#status").textContent'), /已更换封面/)
      await capture('imported-cover')
      win.setSize(1440, 900)
      await pause(350)
      await js('window.scrollTo(0, 0)')
      await click('[data-view="glass"]')
      assert.equal(
        await js('document.querySelector("[data-view=glass]").getAttribute("aria-pressed")'),
        'true',
      )
      assert.equal(await js('document.querySelectorAll(".caption").length'), 1)
      const paletteResults = []
      for (const [name, color, quality] of [
        ['red', '#ed0011', 'cover'],
        ['warm', '#c74721', 'cover'],
        ['cool', '#2460bd', 'cover'],
        ['green', '#328852', 'cover'],
        ['white', '#ffffff', 'neutral'],
        ['black', '#000000', 'neutral'],
        ['transparent', 'transparent', 'fallback'],
      ]) {
        await js(`(async () => {
          const c = document.createElement('canvas'); c.width = c.height = 160;
          const x = c.getContext('2d'); x.fillStyle = ${JSON.stringify(color)}; x.fillRect(0,0,160,160);
          const blob = await new Promise(resolve => c.toBlob(resolve));
          const transfer = new DataTransfer(); transfer.items.add(new File([blob], ${JSON.stringify(name + '.png')}, {type:'image/png'}));
          const input = document.querySelector('#cover'); input.files = transfer.files; input.dispatchEvent(new Event('change'));
        })()`)
        await pause(450)
        assert.equal(
          await js('document.querySelector("#palette-swatches").dataset.quality'),
          quality,
        )
        // Cover repaint now uses both production card faces and glyph masks.
        // Wait for its actual render rather than sampling the previous GPU frame.
        await js(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        )
        const rect = await js(
          '(() => { const r = document.querySelector("#stage").getBoundingClientRect(); return {x:Math.round(r.x+r.width*.5-40),y:Math.round(r.y+r.height*.73),width:80,height:60} })()',
        )
        const bitmap = (await win.capturePage(rect)).toBitmap()
        const sum = [0, 0, 0]
        for (let i = 0; i < bitmap.length; i += 4)
          for (let ch = 0; ch < 3; ch++) sum[ch] += bitmap[i + ch]
        const [b, g, r] = sum.map((value) => value / (bitmap.length / 4))
        console.log(JSON.stringify({ name, rect, r, g, b }))
        if (name === 'warm') assert.ok(r > b + 10, 'Warm cover should produce warm background')
        if (name === 'cool') assert.ok(b > r + 10, 'Cool cover should produce cool background')
        if (name === 'green')
          assert.ok(g > r + 5 && g > b + 5, 'Green cover should produce green background')
        if (quality !== 'cover')
          assert.ok(
            Math.max(r, g, b) - Math.min(r, g, b) < 3,
            'Neutral cover should retain neutral background',
          )
        paletteResults.push({ name, quality, r, g, b })
        if (name === 'red' || name === 'warm' || name === 'cool' || name === 'white') {
          await capture(`palette-${name}`)
          await click('[data-view="recent"]')
          await capture(`new-studies-${name}`)
          if (name === 'red') {
            await click('#theme')
            await click('#foil')
            await capture('new-studies-red-foil')
            const redStage = await js(
              '(() => { const r = document.querySelector("#stage").getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height} })()',
            )
            const redSurfaces = []
            for (const [index, id] of ['paper', 'terrain', 'flow'].entries()) {
              const pixels = (
                await win.capturePage({
                  x: Math.round(redStage.x + (redStage.w * (index + 0.5)) / 3 - 30),
                  y: Math.round(redStage.y + redStage.h * 0.78),
                  width: 60,
                  height: 40,
                })
              ).toBitmap()
              const sum = [0, 0, 0]
              for (let pixel = 0; pixel < pixels.length; pixel += 4)
                for (let channel = 0; channel < 3; channel++)
                  sum[channel] += pixels[pixel + channel]
              const [b, g, r] = sum.map((value) => value / (pixels.length / 4))
              assert.ok(r > g * 2 && r > b * 2, `${id} should retain saturated red at rest`)
              redSurfaces.push({ id, r, g, b })
            }
            await writeFile(
              join(output, 'red-surface-measurements.json'),
              JSON.stringify(redSurfaces, null, 2),
            )
            win.webContents.sendInputEvent({
              type: 'mouseMove',
              x: Math.round(redStage.x + redStage.w / 6 + 70),
              y: Math.round(redStage.y + redStage.h / 2 - 90),
            })
            await capture('new-studies-red-hover')
            win.webContents.sendInputEvent({ type: 'mouseMove', x: 10, y: 10 })
            await click('#foil')
            await capture('new-studies-red-plain')
            await click('#theme')
          }
          await click('[data-view="glass"]')
        }
      }
      const priorColors = await js('document.querySelector("#palette-swatches").dataset.colors')
      await js(
        `(() => { const t = new DataTransfer(); t.items.add(new File(['invalid'], 'broken.png', {type:'image/png'})); const i = document.querySelector('#cover'); i.files=t.files; i.dispatchEvent(new Event('change')); })()`,
      )
      await pause(300)
      assert.equal(
        await js('document.querySelector("#palette-swatches").dataset.colors'),
        priorColors,
      )
      assert.match(await js('document.querySelector("#status").textContent'), /保留上一张/)
      await writeFile(
        join(output, 'palette-measurements.json'),
        JSON.stringify(paletteResults, null, 2),
      )
      assert.deepEqual(errors, [])
      await writeFile(
        join(output, 'verification.json'),
        JSON.stringify(
          {
            ok: true,
            nativeInput: true,
            cases: [
              'seven backgrounds and recent group',
              'hover',
              'foil toggle',
              'light theme',
              '820x720',
              'new studies small window scroll',
              'cover import',
              'independent text mask',
              'unchanged cover',
              'dark background foil',
              'brightness budget',
              'cover-driven warm/cool/green palette',
              'saturated red studies at rest and hover capture',
              'black/white/transparent fallback',
              'invalid cover preserves previous palette',
            ],
            errors,
          },
          null,
          2,
        ),
      )
      console.log(`底图原型验证通过：${output}`)
      app.quit()
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
app.on('window-all-closed', () => app.quit())
