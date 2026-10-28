import type { BrowserWindow } from 'electron'

/** Exercises the real sidebar only in the disposable smoke profile. */
export async function runSidebarSmokeChecks(window: BrowserWindow): Promise<void> {
  if (process.env.AURALIS_SMOKE_TEST !== '1' || !process.env.AURALIS_SMOKE_USER_DATA) {
    throw new Error('Sidebar smoke requires the isolated smoke environment')
  }
  await window.webContents.executeJavaScript(
    `(async () => {
      const until = async (description, predicate) => {
        const deadline = Date.now() + 5000
        while (Date.now() < deadline) {
          if (predicate()) return
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        throw new Error('Sidebar smoke timed out: ' + description)
      }
      const visible = (element) => Boolean(element && element.getClientRects().length &&
        getComputedStyle(element).visibility !== 'hidden')
      const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
        key, bubbles: true, cancelable: true,
      }))
      const createButton = document.querySelector('.app-sidebar .smart-playlist-add-button')
      if (!createButton) throw new Error('Sidebar create trigger is missing')
      createButton.focus()
      createButton.click()
      await until('create menu focus', () => document.querySelector('#sidebar-create-menu')?.contains(document.activeElement))
      const smartTrigger = document.querySelector('#sidebar-create-menu [aria-controls="sidebar-smart-create-submenu"]')
      smartTrigger.focus()
      press('ArrowRight')
      await until('smart submenu focus', () => document.querySelector('#sidebar-smart-create-submenu')?.contains(document.activeElement))
      press('Escape')
      await until('submenu closes before parent', () => !document.querySelector('#sidebar-smart-create-submenu') &&
        document.querySelector('#sidebar-create-menu') && document.activeElement === smartTrigger)
      press('Escape')
      await until('create trigger focus returns', () => !document.querySelector('#sidebar-create-menu') && document.activeElement === createButton)

      const recent = document.querySelector('.app-sidebar [aria-keyshortcuts="ContextMenu Shift+F10"]')
      recent.focus()
      press('ContextMenu')
      await until('recent menu focus and position', () => {
        const menu = document.querySelector('#sidebar-recent-added-context-menu')
        return visible(menu) && menu.contains(document.activeElement)
      })
      document.querySelector('#sidebar-recent-added-context-menu button').click()
      await until('recent range slider focus', () => document.activeElement?.matches('#sidebar-recent-added-range-selector input[type="range"]'))
      const slider = document.activeElement
      slider.value = '1'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
      await until('recent range navigation target updates', () => recent.getAttribute('href').includes('range=30'))
      press('Escape')
      await until('recent trigger focus returns', () => !document.querySelector('#sidebar-recent-added-context-menu') && document.activeElement === recent)

      const playlist = await window.auralis.playlists.create()
      const rowSelector = '[data-sidebar-playlist-key="playlist:' + playlist.id + '"]'
      const row = () => document.querySelector(rowSelector)
      const contextMenu = () => document.querySelector('.sidebar-overlay .collection-context-menu')
      await until('new playlist row loads', () => row())
      row().focus()
      press('ContextMenu')
      await until('playlist menu focus and position', () => visible(contextMenu()) && contextMenu().contains(document.activeElement))
      contextMenu().querySelector('.i-ph-pencil-simple').closest('button').click()
      await until('rename dialog focus', () => document.querySelector('.smart-playlist-dialog input') === document.activeElement &&
        document.querySelector('[data-app-shell-root]').inert)
      const input = document.activeElement
      input.value = 'Sidebar smoke playlist'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await until('rename updates the row and returns focus', () => !document.querySelector('.smart-playlist-dialog') &&
        row()?.textContent.includes('Sidebar smoke playlist') && document.activeElement === row() &&
        !document.querySelector('[data-app-shell-root]').inert)
      press('ContextMenu')
      await until('playlist delete menu focus', () => visible(contextMenu()) && contextMenu().contains(document.activeElement))
      contextMenu().querySelector('[data-delete-playlist]').click()
      await until('delete confirmation', () => contextMenu()?.querySelector('[data-delete-playlist]')?.textContent.match(/确认|Confirm/))
      if (!row()) throw new Error('First delete press removed the playlist without confirmation')
      contextMenu().querySelector('[data-delete-playlist]').click()
      await until('delete removes row and restores fallback focus', () => !row() && !contextMenu() && document.activeElement === createButton)
    })()`,
    true,
  )
}
