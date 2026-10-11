import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'

const root = dirname(fileURLToPath(import.meta.url))
app.setPath('userData', join(root, 'isolated-ui-profile'))
void app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 680,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    const errors: string[] = []
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message)
    })
    const js = (code: string) => win.webContents.executeJavaScript(code, true)
    async function screenshot(name: string) {
      await js(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      )
      await delay(40)
      await writeFile(join(root, name), (await win.webContents.capturePage()).toPNG())
    }
    async function wait(code: string) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await js(code)) return
        await delay(25)
      }
      throw new Error(`UI condition did not become true: ${code}`)
    }
    try {
      await win.loadFile(join(root, 'renderer/scripts/tag-write-probe/index.html'))
      await wait(
        'window.tagEditorProbe?.state().status === "playback-editable" && !!document.querySelector("form")',
      )
      await js('document.fonts.ready')
      const enabled = await js(
        'Array.from(document.querySelectorAll("form input, form button[type=submit]")).every(node => !node.disabled)',
      )
      assert.equal(enabled, true)
      await screenshot('editor-editable.png')
      await js(
        '(() => { const input = document.querySelector("form input"); input.value = "保存失败后保留的编辑内容"; input.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); })()',
      )
      await wait('window.tagEditorProbe.state().saving')
      assert.equal(await js('document.querySelector("form button[type=submit]").disabled'), true)
      await screenshot('editor-saving.png')
      await js('window.tagEditorProbe.fail()')
      await wait('!window.tagEditorProbe.state().saving && !!window.tagEditorProbe.state().error')
      assert.equal(
        await js('document.querySelector("form input").value'),
        '保存失败后保留的编辑内容',
      )
      assert.equal(await js('document.querySelector("form button[type=submit]").disabled'), false)
      assert.equal(
        await js('document.activeElement === document.querySelector("form input")'),
        true,
      )
      await screenshot('editor-failure.png')
      await js(
        'document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))',
      )
      await wait(
        'window.tagEditorProbe.state().saves === 2 && window.tagEditorProbe.state().saving',
      )
      await js('window.tagEditorProbe.fail()')
      await wait('!window.tagEditorProbe.state().saving')
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await wait('!window.tagEditorProbe.state().open')
      assert.equal(await js('document.activeElement.id'), 'return-target')
      assert.deepEqual(errors, [])
      await writeFile(
        join(root, 'ui-result.json'),
        JSON.stringify(
          { enabled, retainedDraft: true, retry: true, focusRestored: true, errors },
          null,
          2,
        ),
      )
      console.log('Metadata editor render, saving, failure retry and keyboard focus checks passed.')
    } finally {
      win.destroy()
      app.quit()
    }
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
