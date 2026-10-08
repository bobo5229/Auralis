<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { createRadioScene, presets, type RadioState, type View } from './scene'
import { DemoAudio } from './audio'

declare const __RADIO_DEMO_TEST__: boolean
const host = ref<HTMLElement>()
const ready = ref(false)
const error = ref('')
const hover = ref('')
const state = reactive<RadioState>({
  on: false,
  volume: 0.4,
  channel: 88,
  bass: 0.5,
  antenna: -1.174,
})
const audio = new DemoAudio()
const activePreset = computed(() =>
  presets.findIndex((frequency) => Math.abs(frequency - state.channel) < 0.025),
)
const views: { id: View; title: string }[] = [
  { id: 'front', title: '正面' },
  { id: 'left', title: '左侧' },
  { id: 'back', title: '背面' },
  { id: 'right', title: '右侧' },
  { id: 'top', title: '顶部' },
]
let scene: ReturnType<typeof createRadioScene> | undefined
function change(patch: Partial<RadioState>) {
  Object.assign(state, patch)
}
function input(key: 'volume' | 'channel' | 'bass' | 'antenna', event: Event) {
  change({ [key]: Number((event.target as HTMLInputElement).value) })
}
function view(id: View) {
  scene?.setView(id)
}
const stopWatching = watch(
  state,
  () => {
    scene?.invalidate(true)
    void audio.update(state.on, state.volume, state.bass, state.channel).catch(() => {
      state.on = false
      error.value = '试听音频无法启动，请检查音频输出后重试。'
    })
  },
  { flush: 'sync' },
)
onMounted(async () => {
  try {
    scene = createRadioScene(
      host.value!,
      () => state,
      change,
      (text) => {
        hover.value = text
      },
      (text) => {
        error.value = text
      },
    )
    if (__RADIO_DEMO_TEST__) {
      Object.assign(window, {
        radioDemoProbe: {
          state: () => ({
            ...state,
            ready: ready.value,
            error: error.value,
            scene: scene?.snapshot(),
          }),
          project: (name: string) => scene!.project(name),
          suspend: () => scene!.dispose(),
          audio: () => audio.snapshot(),
        },
      })
    }
    await scene.ready
    ready.value = true
  } catch (cause) {
    error.value = `收音机加载失败：${cause instanceof Error ? cause.message : String(cause)}`
  }
})
function release() {
  stopWatching()
  scene?.dispose()
  audio.dispose()
}
window.addEventListener('pagehide', release, { once: true })
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', release)
  release()
})
</script>

<template>
  <main class="demo-shell">
    <header class="demo-header">
      <div>
        <p class="eyebrow">AURALIS · OBJECT STUDY 01</p>
        <h1>收音机</h1>
      </div>
      <button class="reset-view" data-view="home" :disabled="!ready" @click="view('home')">
        重置视角 ↗
      </button>
    </header>
    <div class="demo-body">
      <section class="stage" aria-label="三维设备">
        <div ref="host" class="viewport" />
        <div v-if="!ready && !error" class="stage-message" role="status">正在准备收音机…</div>
        <div v-if="error" class="stage-message failure" role="alert">{{ error }}</div>
        <nav class="view-switch" aria-label="观察角度">
          <button
            v-for="item in views"
            :key="item.id"
            :data-view="item.id"
            :disabled="!ready"
            @click="view(item.id)"
          >
            {{ item.title }}
          </button>
        </nav>
        <div class="stage-caption">
          <span>{{ hover || '拖动旋转 · 滚轮缩放 · 拖动旋钮与天线' }}</span>
          <span class="view-limit">360° 环绕 / 俯视</span>
        </div>
      </section>
      <aside class="control-panel" aria-label="收音机控制">
        <div class="status-line">
          <span class="status-dot" :class="{ lit: state.on }" /><span>{{
            state.on ? '正在试听' : '待机'
          }}</span>
        </div>
        <div class="frequency">
          <strong>{{ state.channel.toFixed(1) }}</strong
          ><span>MHz</span>
        </div>
        <p class="preview-note">合成和弦试听 · 调谐改变音高</p>
        <button
          class="power-button"
          data-control="power"
          :disabled="!ready"
          :aria-pressed="state.on"
          @click="change({ on: !state.on })"
        >
          {{ state.on ? '暂停试听' : '开始试听' }}<span>{{ state.on ? 'Ⅱ' : '▶' }}</span>
        </button>
        <div class="sliders">
          <label
            ><span
              >音量 <output>{{ Math.round(state.volume * 100) }}%</output></span
            ><input
              data-control="volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :disabled="!ready"
              :value="state.volume"
              @input="input('volume', $event)"
          /></label>
          <label
            ><span
              >调谐 <output>{{ state.channel.toFixed(1) }} MHz</output></span
            ><input
              data-control="channel"
              type="range"
              min="87"
              max="108"
              step="0.1"
              :disabled="!ready"
              :value="state.channel"
              @input="input('channel', $event)"
          /></label>
          <label
            ><span
              >低音 <output>{{ Math.round(state.bass * 100) }}%</output></span
            ><input
              data-control="bass"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :disabled="!ready"
              :value="state.bass"
              @input="input('bass', $event)"
          /></label>
          <label
            ><span
              >天线 <output>{{ Math.round((-state.antenna * 180) / Math.PI) }}°</output></span
            ><input
              data-control="antenna"
              type="range"
              :min="-Math.PI / 2.5"
              :max="-Math.PI / 4"
              step="0.005"
              :disabled="!ready"
              :value="state.antenna"
              @input="input('antenna', $event)"
          /></label>
        </div>
        <div class="presets">
          <p>频率预设</p>
          <div>
            <button
              v-for="(frequency, index) in presets"
              :key="frequency"
              :data-preset="index"
              :aria-pressed="activePreset === index"
              :disabled="!ready"
              @click="change({ channel: frequency })"
            >
              {{ frequency }}
            </button>
          </div>
        </div>
        <p class="control-note">
          设备与面板同步。旋钮左右拖动，天线上下拖动；顶部与侧面的两个旋钮保留为装饰。
        </p>
      </aside>
    </div>
    <footer class="demo-footer">
      <span>独立试听与交互 demo</span><span>模型：Radiai / Akash Hamirwasia · MIT</span>
    </footer>
  </main>
</template>
