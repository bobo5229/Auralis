import Component from '../../src/renderer/features/library/components/MetadataEditDialog.vue'
import { createSSRApp, h } from 'vue'
import { createI18n } from 'vue-i18n'
import { renderToString } from '@vue/server-renderer'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

  const messages = JSON.parse(await readFile('src/renderer/locales/zh-Hans.json', 'utf8'))
  for (const [status, key] of [['preload-in-use', 'preloadInUse'], ['playback-in-use', 'playbackInUse']]) {
    const app = createSSRApp({ render: () => h(Component, { open: true, saving: false, errorMessage: null, editStatus: status, metadata: { trackId: 1, title: '示例', artistDisplay: '示例艺术家', albumTitle: '示例专辑', albumArtistDisplay: '示例艺术家', genreDisplay: '流行', year: 2026, releaseDate: '2026-10-08' } }) })
    app.use(createI18n({ legacy: false, locale: 'zh-Hans', messages: { 'zh-Hans': messages } }))
    const context = {}
    await renderToString(app, context)
    const html = context.teleports.body
    assert.ok(html.includes(messages.library.metadataEditor.status[key]))
    const otherKey = key === 'preloadInUse' ? 'playbackInUse' : 'preloadInUse'
    assert.ok(!html.includes(messages.library.metadataEditor.status[otherKey]))
    assert.equal((html.match(/<input[^>]* disabled/g) || []).length, 6)
    assert.match(html, /<button[^>]*type="submit"[^>]*disabled/)
    assert.ok(!html.includes('animate-spin'))
    console.log(`${status}: correct notice, six disabled inputs, disabled save, no spinner`)
  }
