import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import zh from '../../../src/renderer/locales/zh-Hans.json'
import { setMotionPreference } from '../../../src/renderer/shared/animation/motionPreference'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '../../../src/renderer/app/styles/main.css'

// This launcher has its own userData; make repeated verification deterministic.
localStorage.clear()
setMotionPreference('system')

// Instrument only this isolated harness, before mounting the real page/controller/shader.
const stats = { created: 0, draws: 0, deleted: 0, tilt: [] as number[], vinyl: 0, dark: 0 }
const nativeContext = HTMLCanvasElement.prototype.getContext
const seen = new WeakSet<object>()
let unavailable = false
HTMLCanvasElement.prototype.getContext = function (...args: unknown[]) {
  if (args[0] === 'webgl' && unavailable) return null
  const context = nativeContext.apply(this, args as never)
  if (args[0] === 'webgl' && context && !seen.has(context)) {
    seen.add(context)
    stats.created++
    const gl = context as WebGLRenderingContext
    const names = new Map<WebGLUniformLocation, string>()
    const location = gl.getUniformLocation.bind(gl)
    gl.getUniformLocation = (program, name) => {
      const result = location(program, name)
      if (result) names.set(result, name)
      return result
    }
    const draw = gl.drawArrays.bind(gl)
    gl.drawArrays = (...values) => {
      stats.draws++
      draw(...values)
    }
    const remove = gl.deleteProgram.bind(gl)
    gl.deleteProgram = (program) => {
      stats.deleted++
      remove(program)
    }
    const uniform3 = gl.uniform3f.bind(gl)
    gl.uniform3f = (where, x, y, z) => {
      if (where && names.get(where) === 'tilt') stats.tilt = [x, y, z]
      uniform3(where, x, y, z)
    }
    const uniform1 = gl.uniform1f.bind(gl)
    gl.uniform1f = (where, value) => {
      if (where && names.get(where) === 'vinyl') stats.vinyl = value
      if (where && names.get(where) === 'dark') stats.dark = value
      uniform1(where, value)
    }
  }
  return context
} as typeof nativeContext
const { default: Page } =
  await import('../../../src/renderer/features/albums/pages/CdAlbumsPage.vue')
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'cd-albums', component: Page },
    { path: '/away', name: 'albums', component: { render: () => h('p', '已离开唱片室') } },
    { path: '/index', name: 'cd-album-index', component: { render: () => h('p', '索引') } },
  ],
})
await router.push('/')
await router.isReady()
createApp({ render: () => h(RouterView) })
  .use(router)
  .use(createI18n({ legacy: false, locale: 'zh-Hans', messages: { 'zh-Hans': zh } }))
  .directive('tooltip', {})
  .mount('#app')
Object.assign(window, {
  productionMaterial: {
    stats,
    leave: () => router.push('/away'),
    enter: () => router.push('/'),
    unavailable: (next: boolean) => {
      unavailable = next
    },
    reduced: (value: boolean) => setMotionPreference(value ? 'reduce' : 'system'),
  },
})
