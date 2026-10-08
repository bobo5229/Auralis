<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { createPouchScene, type PouchSnapshot } from './scene'
import type { CardFinish } from './card'
import { cardSamples, type CardSample } from './cardArtwork'

declare const __POUCH_DEMO_TEST__: boolean
const host = ref<HTMLElement>()
const error = ref('')
const state = ref<PouchSnapshot>()
const resetButton = ref<HTMLButtonElement>()
let scene: ReturnType<typeof createPouchScene> | undefined
const hint = computed(() =>
  state.value?.choice
    ? state.value.choice === 'play'
      ? '已选择 Play。当前为虚构样张，演示记录选择。'
      : state.value.discardProgress < 1
        ? '闪卡正在化为像素块。'
        : '已丢弃这张闪卡。可重新拆一遍。'
    : state.value?.back
      ? '这是袋背。翻回正面后继续拆袋。'
      : !state.value?.opened
        ? state.value?.progress
          ? '裂口会保留。从裂口右侧继续向左撕。'
          : '抓住右上撕口，向左拉开封边。'
        : state.value.extracted
          ? '围绕卡片移动鼠标，观察闪膜随倾角变化。切换工艺比较同一张封面。'
          : '包装已拆开。点击闪卡，放大查看。',
)
const handle = ref({ x: 0, y: 0 })
const cardCenter = ref(0)
function changed(value: PouchSnapshot) {
  state.value = value
  if (scene && host.value) {
    const at = scene.project('tip'),
      rect = host.value.getBoundingClientRect()
    handle.value = { x: at.x - rect.left, y: at.y - rect.top }
    cardCenter.value = scene.project('card-center').x - rect.left
  }
}
function finish(value: CardFinish) {
  scene?.setCardFinish(value)
}
function sample(event: Event) {
  const value = (event.target as HTMLSelectElement).value as CardSample
  scene?.setCardSample(value)
}
async function choose(value: 'play' | 'discard') {
  scene?.choose(value)
  await nextTick()
  resetButton.value?.focus({ preventScroll: true })
}
function release() {
  scene?.dispose()
}
onMounted(() => {
  try {
    scene = createPouchScene(host.value!, changed)
    changed(scene.snapshot())
    window.addEventListener('pagehide', release, { once: true })
    if (__POUCH_DEMO_TEST__) {
      Object.assign(window, {
        pouchDemoProbe: {
          state: () => scene?.snapshot(),
          project: (name: 'tip' | 'card' | 'card-center' | 'body' | 'end') => scene?.project(name),
          dispose: release,
        },
      })
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', release)
  release()
})
</script>

<template>
  <main class="demo">
    <header>
      <div class="identity">AURALIS <span>／ MATERIAL STUDY 02</span></div>
      <span class="auralis-type-caption">镭射盲袋与闪卡 · 隔离原型</span>
    </header>
    <div class="workspace">
      <section class="stage" aria-label="包装袋交互区">
        <div ref="host" class="viewport" />
        <div
          v-if="state && !state.opened && !state.disposed && !state.back"
          class="tear-hint"
          :style="{ left: handle.x + 'px', top: handle.y + 'px' }"
          aria-hidden="true"
        >
          <span class="handle-ring" /><span class="handle-label">← 从这里撕开</span>
        </div>
        <div class="stage-caption">
          <span>{{ state?.extracted ? '02 / ALBUM FOIL' : '01 / SEALED SOUND' }}</span
          ><span>{{
            state?.extracted ? '同一封面 · 两种闪膜工艺' : '镭射薄膜 · 背封边 · 锯齿口'
          }}</span>
        </div>
        <div
          v-if="state?.extracted && !state.back"
          class="card-actions"
          :style="{ left: cardCenter + 'px' }"
          aria-label="本次专辑选择"
        >
          <button data-choice="play" :disabled="!!state.choice" @click="choose('play')">
            Play
          </button>
          <button data-choice="discard" :disabled="!!state.choice" @click="choose('discard')">
            Discard
          </button>
        </div>
        <p v-if="error || state?.contextLost" class="error">
          {{ error || '图形上下文暂时丢失，请等待恢复或重启 demo。' }}
        </p>
      </section>
      <aside>
        <span class="eyebrow">A LITTLE UNKNOWN</span>
        <h1>拆开，<br />听见下一张。</h1>
        <p class="description">撕开镭射袋，抽出闪卡。<br />转动光线，发现封面的另一面。</p>
        <div class="finishes" aria-label="闪卡工艺">
          <button
            data-card-finish="bands"
            :aria-pressed="state?.cardFinish === 'bands'"
            @click="finish('bands')"
          >
            条带虹彩
          </button>
          <button
            data-card-finish="glitter"
            :aria-pressed="state?.cardFinish === 'glitter'"
            @click="finish('glitter')"
          >
            细闪点
          </button>
        </div>
        <label class="sample-select">
          <span>布局样张</span>
          <select data-action="sample" :value="state?.cardSample || 'blue'" @change="sample">
            <option v-for="item in cardSamples" :key="item.id" :value="item.id">
              {{ item.label }}
            </option>
          </select>
        </label>
        <div class="instruction" aria-live="polite">
          <div class="step">
            <span>{{ state?.opened ? '02' : '01' }}</span
            ><b>{{ state?.opened ? '揭开袋口' : '撕开封边' }}</b
            ><span>{{ Math.round((state?.progress || 0) * 100) }}%</span>
          </div>
          <div class="progress"><i :style="{ width: (state?.progress || 0) * 100 + '%' }" /></div>
          <p>{{ hint }}</p>
        </div>
        <button
          class="primary"
          data-action="extract"
          :disabled="!state?.opened || state.back || state.choice === 'discard'"
          @click="scene?.extract()"
        >
          {{ state?.extracted ? '收起闪卡' : '查看闪卡' }} <span>↗</span>
        </button>
        <div class="secondary">
          <button ref="resetButton" data-action="reset" @click="scene?.reset()">重新拆一遍</button>
          <button
            v-if="state?.extracted"
            data-action="flip-card"
            :disabled="state.choice === 'discard'"
            @click="scene?.flipCard()"
          >
            {{ state.cardBack ? '翻回卡面' : '查看曲目' }}
          </button>
          <button v-else-if="!state?.opened" data-action="turn" @click="scene?.turn()">
            {{ state?.back ? '翻回正面' : '翻看袋背' }}
          </button>
        </div>
        <details>
          <summary>键盘操作</summary>
          <p>按下方按钮逐段撕开；Esc 松开当前抓取。</p>
          <button
            data-action="tear"
            :disabled="state?.opened || state?.back"
            @click="scene?.keyboardTear()"
          >
            撕开一段
          </button>
        </details>
      </aside>
    </div>
    <footer>
      <span>移动鼠标观察反光 · 抽出后比较两种闪膜</span
      ><span>仅本地原型 · 虚构专辑样张 · 无曲库连接</span>
    </footer>
  </main>
</template>
