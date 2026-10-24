<script setup lang="ts">
import { computed, KeepAlive, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AlbumsPage from '@renderer/features/albums/pages/AlbumsPage.vue'
import type { AlbumLayoutTransitionParticipant } from '@renderer/shared/animation/albumLayoutTransition'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { motionMode, motionStats } from './motion'
import { setCatalog } from './fixture'

const page = ref<AlbumLayoutTransitionParticipant | null>(null)
const panel = ref<HTMLElement | null>(null)
const panelOpen = ref(true)
const scale = ref(1000)
const busy = ref(false)
const animating = ref(false)
const duration = ref(500)
const reduced = ref(false)
const theme = ref('dark')
const generationMs = ref(0)
const mountedCards = ref(0)
const latest = ref<any>(null)
const history = ref<any[]>([])
const countLabel = computed(() => scale.value.toLocaleString('zh-CN'))
const motionQuery = createReducedMotionQuery()
let revision = 0
let panelAnimation: Animation | null = null
let stopSample: (() => void) | null = null
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

function countNodes() {
  mountedCards.value = document.querySelectorAll('.demo-stage .album-card').length
}
function cancel() {
  page.value?.cancelLyricsLayoutTransition(revision)
  revision++
  panelAnimation?.cancel()
  panelAnimation = null
  stopSample?.()
  stopSample = null
  animating.value = false
}

async function changeScale(value: number) {
  cancel()
  busy.value = true
  await frame()
  const start = performance.now()
  scale.value = value
  document.querySelector('.albums-scroll')?.scrollTo(0, 0)
  setCatalog(value)
  await nextTick()
  await frame()
  await frame()
  generationMs.value = performance.now() - start
  countNodes()
  busy.value = false
}

async function toggle() {
  if (busy.value || !page.value || !panel.value) return
  const current = ++revision
  const start = performance.now()
  const oldPanel = getComputedStyle(panel.value).transform
  panelAnimation?.cancel()
  const participant = page.value
  const beforeScroll = document.querySelector('.albums-scroll')!.scrollTop
  const oldColumns = document.querySelector('.albums-grid-row')?.children.length ?? 0
  const prepared = participant.prepareLyricsLayoutTransition(current)
  panelOpen.value = !panelOpen.value
  animating.value = true
  const samples: number[] = []
  const longTasks: number[] = []
  let last = start,
    raf = 0,
    sampling = true
  stopSample?.()
  const sample = (now: number) => {
    if (!sampling) return
    samples.push(now - last)
    last = now
    raf = requestAnimationFrame(sample)
  }
  raf = requestAnimationFrame(sample)
  const observer = new PerformanceObserver((list) =>
    longTasks.push(...list.getEntries().map((e) => e.duration)),
  )
  observer.observe({ type: 'longtask' })
  const stop = () => {
    sampling = false
    cancelAnimationFrame(raf)
    observer.disconnect()
  }
  stopSample = stop
  await nextTick()
  if (
    !prepared ||
    !(await participant.commitLyricsLayoutTransition(current)) ||
    current !== revision
  ) {
    stop()
    if (current === revision) cancel()
    return
  }
  const setupMs = performance.now() - start
  const targetPanel = panelOpen.value ? 'translateX(0)' : 'translateX(100%)'
  const instant = reduced.value || motionQuery.matches
  panelAnimation = panel.value.animate([{ transform: oldPanel }, { transform: targetPanel }], {
    duration: instant ? 0 : duration.value,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    fill: 'forwards',
  })
  if (!instant) await participant.animateLyricsLayoutTransition(current, duration.value)
  if (current !== revision) {
    stop()
    return
  }
  await participant.finishLyricsLayoutTransition(current)
  if (current !== revision) {
    stop()
    return
  }
  panelAnimation?.cancel()
  panelAnimation = null
  await frame()
  stop()
  stopSample = null
  animating.value = false
  countNodes()
  const sorted = samples.slice().sort((a, b) => a - b)
  latest.value = {
    scale: scale.value,
    mode: motionMode.value,
    action: panelOpen.value ? '展开' : '收起',
    columns: `${oldColumns} → ${document.querySelector('.albums-grid-row')?.children.length ?? 0}`,
    setupMs: +setupMs.toFixed(1),
    p95: +(sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0).toFixed(1),
    maxFrame: +(sorted.at(-1) ?? 0).toFixed(1),
    slowFrames: samples.filter((n) => n > 32).length,
    longTasks,
    mounted: mountedCards.value,
    nodes: instant ? 0 : document.querySelectorAll('.album-grid-transition-item').length,
    animated: instant ? 0 : motionMode.value === 'flip' ? motionStats.value.nodes : null,
    matched: instant ? 0 : motionMode.value === 'flip' ? motionStats.value.matched : null,
    beforeScroll,
    afterScroll: document.querySelector('.albums-scroll')!.scrollTop,
    totalMs: +(performance.now() - start).toFixed(1),
    reduced: instant,
  }
  history.value = [latest.value, ...history.value].slice(0, 6)
}

function jump(fraction: number) {
  cancel()
  const scroll = document.querySelector('.albums-scroll')!
  scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * fraction
  void frame().then(countNodes)
}
function keyboard(event: KeyboardEvent) {
  if (event.key !== ' ' || (event.target as Element)?.closest('input,select,button')) return
  event.preventDefault()
  void toggle()
}
function resize() {
  if (animating.value) cancel()
}
function preferenceChanged() {
  if (animating.value) cancel()
}
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
}
onMounted(async () => {
  await changeScale(1000)
  window.addEventListener('keydown', keyboard)
  window.addEventListener('resize', resize)
  motionQuery.addEventListener('change', preferenceChanged)
  ;(window as any).demo = {
    toggle,
    changeScale,
    jump,
    cancel,
    setMode: (mode: 'flip' | 'fade') => {
      cancel()
      motionMode.value = mode
    },
    setReduced: (value: boolean) => {
      cancel()
      reduced.value = value
    },
    setDuration: (ms: number) => {
      duration.value = ms
    },
    state: () => ({
      scale: scale.value,
      busy: busy.value,
      animating: animating.value,
      panelOpen: panelOpen.value,
      latest: latest.value,
      history: history.value,
    }),
  }
})
onBeforeUnmount(() => {
  cancel()
  window.removeEventListener('keydown', keyboard)
  window.removeEventListener('resize', resize)
  motionQuery.removeEventListener('change', preferenceChanged)
})
</script>

<template>
  <div class="demo-app">
    <header class="demo-header">
      <div>
        <span class="demo-kicker">AURALIS / MOTION STUDY</span>
        <h1>专辑重排实验</h1>
      </div>
      <span class="demo-isolation">模拟曲库 · 独立运行</span>
    </header>
    <div class="demo-toolbar">
      <label
        >规模
        <select
          id="scale"
          :value="scale"
          :disabled="busy"
          @change="changeScale(Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="1000">1000 · 当前规模</option>
          <option :value="5000">5000 · 增长</option>
          <option :value="20000">2 万 · 压力</option>
          <option :value="100000">10 万 · 极限</option>
        </select></label
      >
      <label
        >动效
        <select id="mode" v-model="motionMode" @change="cancel">
          <option value="flip">连续重排 · FLIP</option>
          <option value="fade">当前方案 · 淡入淡出</option>
        </select></label
      >
      <label
        >时长
        <input
          id="duration"
          v-model.number="duration"
          type="range"
          min="160"
          max="600"
          step="20"
        /><output>{{ duration }} ms</output></label
      >
      <button id="toggle" class="demo-primary" :disabled="busy" @click="toggle">
        {{ panelOpen ? '收起右侧面板' : '展开右侧面板' }}
      </button>
      <label class="demo-reduce"
        ><input v-model="reduced" type="checkbox" @change="cancel" />减弱动效</label
      >
    </div>
    <main class="demo-workspace">
      <aside class="demo-sidebar">
        <strong>AuralisMusic</strong><span>资料库</span>
        <div class="demo-nav">▱　专辑</div>
        <p>{{ countLabel }} 张模拟专辑</p>
        <div class="demo-jumps">
          <button @click="jump(0)">回到顶部</button><button @click="jump(0.5)">跳至中段</button
          ><button @click="jump(0.98)">跳至尾部</button>
        </div>
        <small>空格键切换面板<br />可连续点击观察反向效果</small>
      </aside>
      <div class="demo-stage" :class="{ 'panel-open': panelOpen }">
        <div class="demo-grid">
          <KeepAlive><AlbumsPage ref="page" @cancel-layout-transition="cancel" /></KeepAlive>
        </div>
        <aside ref="panel" class="demo-panel" :class="{ closed: !panelOpen }" :inert="!panelOpen">
          <header>
            <span>正在聆听</span><button aria-label="收起面板" @click="toggle">×</button>
          </header>
          <div class="demo-disc">◉</div>
          <h2>Still / Moving</h2>
          <p>Auralis Ensemble</p>
          <div class="demo-lyrics">
            <span>在安静的唱片之间</span><strong>看见每一次移动</strong><span>让熟悉的位置</span
            ><span>慢慢延伸到远方</span>
          </div>
          <small>占位面板，用于触发专辑列数变化</small>
        </aside>
      </div>
    </main>
    <footer class="demo-metrics">
      <div>
        <b>{{ busy ? '正在准备模拟曲库…' : `${countLabel} 张专辑` }}</b
        ><span>实际挂载 {{ mountedCards }} 张卡片</span
        ><span>曲库准备 {{ generationMs.toFixed(0) }} ms</span
        ><button @click="toggleTheme">{{ theme === 'dark' ? '浅色' : '深色' }}</button>
      </div>
      <p v-if="latest">
        {{ latest.mode === 'flip' ? '连续重排' : '淡入淡出' }} · {{ latest.action }} ·
        {{ latest.columns }} 列　准备 {{ latest.setupMs }} ms　帧间隔 P95 {{ latest.p95 }} ms　最长
        {{ latest.maxFrame }} ms　&gt;32ms {{ latest.slowFrames }} 帧<span
          v-if="latest.matched !== null"
          >　匹配 {{ latest.matched }} 张</span
        >
      </p>
      <p v-else>切换面板观察同一张专辑的路径；数字为当前环境采样，不能代表正式应用性能。</p>
      <details>
        <summary>最近对照记录与测试范围</summary>
        <p>
          保留真实专辑页、卡片、虚拟器、几何与滚动定位。曲库输入、封面和播放为模拟；每张专辑用一条占位曲目代表，不测试文件扫描、数据库或真实图片解码压力。
        </p>
        <div v-for="(entry, i) in history" :key="i">
          {{ entry.scale }} 张 / {{ entry.mode }} / {{ entry.action }} / {{ entry.columns }} 列 /
          准备 {{ entry.setupMs }} ms / P95 {{ entry.p95 }} ms / 挂载 {{ entry.mounted }} 张
        </div>
      </details>
    </footer>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  overflow: hidden;
}
body {
  background: var(--auralis-bg);
  color: var(--auralis-text);
  font-family: var(--auralis-font-ui);
}
.demo-app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.demo-header {
  padding: 20px 24px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--auralis-border);
}
.demo-kicker {
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
  letter-spacing: 0.16em;
}
.demo-header h1 {
  font-size: var(--auralis-type-page-size);
  line-height: var(--auralis-type-page-line-height);
  font-weight: 650;
  margin-top: 4px;
}
.demo-isolation {
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
}
.demo-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  flex-wrap: wrap;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}
.demo-toolbar label {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.demo-app button,
.demo-app select {
  border: 1px solid var(--auralis-border);
  border-radius: 6px;
  padding: 7px 10px;
  background: var(--auralis-surface);
  color: var(--auralis-text);
  cursor: pointer;
}
.demo-app button:focus-visible,
.demo-app select:focus-visible,
.demo-app input:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 3px;
}
.demo-app button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.demo-toolbar input[type='range'] {
  width: 90px;
  accent-color: var(--auralis-sidebar-active-indicator);
}
.demo-toolbar output {
  width: 48px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
}
.demo-toolbar .demo-primary {
  background: var(--auralis-sidebar-active-bg);
  color: var(--auralis-sidebar-active-text);
  border-color: transparent;
}
.demo-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-block: 1px solid var(--auralis-border);
}
.demo-sidebar {
  width: 176px;
  flex-shrink: 0;
  padding: 24px 16px;
  background: var(--auralis-sidebar-bg);
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-right: 1px solid var(--auralis-border);
}
.demo-sidebar strong {
  font-size: var(--auralis-type-section-size);
  margin-bottom: 16px;
}
.demo-sidebar > span,
.demo-sidebar p,
.demo-sidebar small {
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: var(--auralis-text-muted);
}
.demo-nav {
  padding: 12px;
  border-radius: 8px;
  background: var(--auralis-sidebar-active-bg);
  color: var(--auralis-sidebar-active-text);
}
.demo-jumps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  font-size: var(--auralis-type-caption-size);
}
.demo-stage {
  --demo-panel-width: min(360px, 22vw);
  flex: 1;
  position: relative;
  min-width: 0;
  overflow: hidden;
}
.demo-grid {
  height: 100%;
  width: 100%;
}
.demo-stage.panel-open .demo-grid {
  width: calc(100% - var(--demo-panel-width));
}
.demo-stage .albums-page {
  height: 100%;
  width: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.demo-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: var(--demo-panel-width);
  z-index: 60;
  border-left: 1px solid var(--auralis-border);
  background: var(--auralis-frosted-surface-bg);
  backdrop-filter: var(--auralis-frosted-surface-filter);
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(0);
}
.demo-panel.closed {
  transform: translateX(100%);
}
.demo-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
}
.demo-panel header button {
  border: 0;
  font-size: 22px;
  padding: 0 8px;
}
.demo-disc {
  font-size: 110px;
  line-height: 1;
  color: #b9ac7d;
  margin: 30px 0 16px;
}
.demo-panel h2 {
  font-size: var(--auralis-type-section-size);
  font-weight: 600;
}
.demo-panel p,
.demo-panel small {
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: var(--auralis-text-muted);
}
.demo-panel small {
  margin-top: auto;
  text-align: center;
}
.demo-lyrics {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 38px 0;
  text-align: center;
  font-size: var(--auralis-type-body-size);
  color: var(--auralis-text-muted);
}
.demo-lyrics strong {
  color: var(--auralis-text);
}
.demo-metrics {
  padding: 10px 24px;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  background: var(--auralis-bg);
  z-index: 70;
  max-height: 24vh;
  overflow: auto;
}
.demo-metrics > div {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 4px;
}
.demo-metrics span,
.demo-metrics p {
  color: var(--auralis-text-muted);
}
.demo-metrics button {
  margin-left: auto;
  padding: 3px 10px;
}
.demo-metrics details {
  margin-top: 5px;
}
.demo-metrics summary {
  cursor: pointer;
}
.demo-metrics details p {
  max-width: 1050px;
  padding: 8px 0;
}
</style>
