const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const output = path.resolve(__dirname, '../../../.electron-home/recent-added-journal')
app.setPath('userData', path.join(output, 'profile'))
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1440,
      height: 1100,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    const errors = []
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message)
    })
    await win.loadFile(path.join(__dirname, 'index.html'))
    const run = (source) => win.webContents.executeJavaScript(source)
    await run(
      'document.fonts.ready.then(() => Promise.all([...document.images].filter(i => i.getAttribute("src")).map(i => i.decode())))',
    )
    fs.mkdirSync(output, { recursive: true })
    const capture = async (name) => {
      await new Promise((r) => setTimeout(r, 200))
      fs.writeFileSync(path.join(output, name), (await win.webContents.capturePage()).toPNG())
    }
    assert.equal(await run('document.querySelectorAll(".day:not([hidden])").length'), 3)
    await capture('light.png')
    await run('document.querySelector("[data-filter=addition]").click()')
    assert.equal(await run('document.querySelectorAll(".day:not([hidden])").length'), 1)
    assert.equal(await run('document.querySelectorAll(".entry:not([hidden])").length'), 1)
    await run('document.querySelector("[data-album=white]").click()')
    assert.equal(await run('document.querySelector("dialog").open'), true)
    assert.equal(await run('document.querySelector("#dialog-title").textContent'), 'The Beatles')
    await run('document.querySelector("#dialog-cover").decode()')
    await capture('detail.png')
    await run('document.querySelector(".dialog-close").click()')
    assert.equal(await run('document.querySelector("dialog").open'), false)
    await run(
      'document.querySelector("[data-filter=all]").click(); document.querySelector("#theme").click()',
    )
    await capture('dark.png')
    win.setContentSize(720, 900)
    await run('document.querySelector("#theme").click()')
    await capture('narrow.png')
    assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true)
    for (const button of ['blue', 'abbey', 'post', 'melodrama', 'unknown', '1989', 'lover']) {
      await run(`document.querySelector('[data-album="${button}"]').click()`)
      await run('document.querySelector("#dialog-cover").decode()')
      await run('document.querySelector(".dialog-close").click()')
    }
    assert.deepEqual(errors, [])
    console.log(
      'PASS: local artwork, filters, album previews, themes, narrow overflow; captures at ' +
        output,
    )
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
