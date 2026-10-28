<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { parseLrc } from '../../../src/renderer/features/lyrics/utils/parseLrc'
import { getActiveLyricIndex } from '../../../src/renderer/features/lyrics/utils/getActiveLyricIndex'
import { enhanced, plain, contentKey, effectEnvelope } from './fixtures'
import Icon from './Icon.vue'

const source = ref(enhanced)
const sample = ref('enhanced')
const editing = ref(false)
const immersive = ref(false)
const theme = ref('dark')
const effects = ref(true)
const time = ref(0)
const duration = ref(32)
const playing = ref(false)
const ready = ref(false)
const previewing = ref(false)
const focusRow = ref(2)
const focusPart = ref(null)
const follow = ref(true)
const notice = ref('')
const saveState = ref('已保存到本机')
const audioName = ref('原创合成伴奏 · 无人声')
const lyricsName = ref('慢下来')
const localAudio = ref(null)
const localLyrics = ref(null)
const lyricViewport = ref(null)
const volume = ref(0.55)
const selected = ref(new Set())
const history = ref([])
const audio = new Audio(new URL('./demo.wav', import.meta.url).href)
audio.preload = 'auto'
audio.volume = volume.value
let objectUrl = null
let frame = 0
let previewEnd = Infinity
const mediaQuery = matchMedia('(prefers-reduced-motion: reduce)')
const reduced = ref(mediaQuery.matches)
const lines = computed(() => parseLrc(source.value))
const activeRow = computed(() => getActiveLyricIndex(lines.value, time.value))
const currentLine = computed(() => lines.value[focusRow.value])
const unitKey = (row, part) => `${row}:${part === null ? 'line' : part}`
const isMarked = (row, part) => selected.value.has(unitKey(row, part))
const count = computed(() => selected.value.size)
const modeLabel = computed(() =>
  sample.value === 'custom' ? '本地歌词' : sample.value === 'enhanced' ? '增强 LRC' : '普通 LRC',
)
const selectedLabel = computed(() => {
  const line = currentLine.value
  if (!line) return ''
  if (focusPart.value === null || !line.segments) return line.text
  return line.segments[focusPart.value]?.text ?? line.text
})
const selectedTiming = computed(() => {
  const line = currentLine.value
  if (!line) return ''
  const part = line.segments?.[focusPart.value]
  const start = part?.startTimeSeconds ?? line.timeSeconds
  const end = part?.endTimeSeconds
  return `${clock(start, true)} · ${end != null ? `至 ${clock(end, true)}` : '默认 1.5 秒'}`
})

function clock(value, precise = false) {
  const ms = Math.max(0, Math.round(value * 1000))
  const text = `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
  return precise ? `${text}.${String(ms % 1000).padStart(3, '0')}` : text
}
function nextLineStart(row) {
  return (
    lines.value.slice(row + 1).find((line) => line.timeSeconds > lines.value[row].timeSeconds)
      ?.timeSeconds ?? duration.value
  )
}
function interval(row, part) {
  const line = lines.value[row]
  const segment = part === null ? null : line.segments?.[part]
  const start = segment?.startTimeSeconds ?? line.timeSeconds
  const next = part === null ? Infinity : (line.segments?.[part + 1]?.startTimeSeconds ?? Infinity)
  const end = Math.min(
    segment?.endTimeSeconds ?? start + 1.5,
    next,
    nextLineStart(row),
    duration.value,
  )
  return { start, end }
}
function visual(row, part) {
  let strength = 0
  if (effects.value && !reduced.value && isMarked(row, part) && activeRow.value === row) {
    const { start, end } = interval(row, part)
    strength = effectEnvelope(time.value, start, end)
  }
  return {
    transform: `translateY(${-0.14 * strength}em) scale(${1 + 0.13 * strength})`,
    textShadow:
      strength > 0
        ? `0 0 ${8 + 12 * strength}px rgba(var(--glow-rgb),${0.32 * strength}), 0 0 ${22 + 16 * strength}px rgba(var(--glow-rgb),${0.13 * strength})`
        : 'none',
    '--emphasis': strength,
  }
}
function persist() {
  try {
    localStorage.setItem(
      contentKey(source.value),
      JSON.stringify({ source: source.value, selected: [...selected.value] }),
    )
    saveState.value = '已保存到本机'
  } catch {
    saveState.value = '仅本次有效：本地存储不可用'
  }
}
function loadMarks() {
  let marks
  try {
    const value = JSON.parse(localStorage.getItem(contentKey(source.value)) || 'null')
    if (value?.source === source.value && Array.isArray(value.selected)) marks = value.selected
  } catch {
    /* Demo remains usable when browser storage is unavailable. */
  }
  const defaults =
    sample.value === 'enhanced'
      ? ['0:3', '2:2', '3:3', '4:3']
      : sample.value === 'plain'
        ? ['2:line']
        : []
  const allowed = new Set(
    lines.value.flatMap((line, row) =>
      line.segments ? line.segments.map((_, part) => unitKey(row, part)) : [unitKey(row, null)],
    ),
  )
  selected.value = new Set((marks ?? defaults).filter((key) => allowed.has(key)))
  history.value = []
}
function toggleMark(row, part) {
  focusRow.value = row
  focusPart.value = part
  if (!editing.value) {
    seek(lines.value[row].timeSeconds)
    return
  }
  history.value = [...history.value.slice(-49), [...selected.value]]
  const next = new Set(selected.value)
  const key = unitKey(row, part)
  next.has(key) ? next.delete(key) : next.add(key)
  selected.value = next
  persist()
}
function focusLine(row) {
  focusRow.value = row
  focusPart.value = null
  if (!editing.value) seek(lines.value[row].timeSeconds)
}
function undo() {
  if (!history.value.length) return
  selected.value = new Set(history.value.at(-1))
  history.value = history.value.slice(0, -1)
  persist()
}
function clearLine() {
  const prefix = `${focusRow.value}:`
  if (![...selected.value].some((key) => key.startsWith(prefix))) return
  history.value = [...history.value.slice(-49), [...selected.value]]
  selected.value = new Set([...selected.value].filter((key) => !key.startsWith(prefix)))
  persist()
}
function publishTime() {
  time.value = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
}
function stopFrame() {
  cancelAnimationFrame(frame)
  frame = 0
}
function tick() {
  frame = 0
  publishTime()
  if (previewing.value && time.value >= previewEnd) {
    audio.pause()
    audio.currentTime = Math.max(0, previewEnd - 0.025)
    publishTime()
    previewing.value = false
    return
  }
  if (!audio.paused && !audio.ended) frame = requestAnimationFrame(tick)
}
function onPlay() {
  playing.value = true
  if (!frame) frame = requestAnimationFrame(tick)
}
function onPause() {
  playing.value = false
  stopFrame()
  publishTime()
}
function onEnded() {
  onPause()
  previewing.value = false
}
function onMetadata() {
  if (Number.isFinite(audio.duration)) duration.value = audio.duration
  ready.value = true
}
function onAudioError() {
  notice.value = '音频无法播放，请重新选择浏览器支持的音频文件。'
  ready.value = false
  onPause()
}
async function play() {
  notice.value = ''
  try {
    await audio.play()
  } catch {
    notice.value = '无法开始播放，请检查音频文件后重试。'
  }
}
function seek(value) {
  previewing.value = false
  audio.currentTime = Math.max(0, Math.min(Number(value), duration.value))
  publishTime()
}
async function togglePlay() {
  if (!audio.paused) audio.pause()
  else {
    if (audio.ended || time.value >= duration.value - 0.01) seek(0)
    await play()
  }
}
async function preview() {
  if (!currentLine.value || !ready.value) return
  if (currentLine.value.timeSeconds >= duration.value) {
    notice.value = '本行时间超出音频时长，请选择匹配的音频或歌词。'
    return
  }
  audio.pause()
  audio.currentTime = Math.max(0, currentLine.value.timeSeconds - 0.8)
  publishTime()
  previewEnd = Math.min(nextLineStart(focusRow.value), duration.value)
  previewing.value = true
  follow.value = true
  await play()
}
function switchEdit() {
  editing.value = !editing.value
  follow.value = !editing.value
  previewing.value = false
}
function setAudio(url, name) {
  audio.pause()
  previewing.value = false
  ready.value = false
  time.value = 0
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = url.startsWith('blob:') ? url : null
  audio.src = url
  audio.load()
  audioName.value = name
}
function chooseSample(value) {
  if (sample.value === value) return
  source.value = value === 'enhanced' ? enhanced : plain
  sample.value = value
  lyricsName.value = '慢下来'
  focusRow.value = 2
  focusPart.value = null
  notice.value = ''
  setAudio(new URL('./demo.wav', import.meta.url).href, '原创合成伴奏 · 无人声')
  loadMarks()
}
async function importLyrics(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 512 * 1024) {
    notice.value = '请选择小于 512 KB 的 LRC 文件。'
    return
  }
  try {
    const raw = await file.text()
    if (!parseLrc(raw).length) {
      notice.value = '未找到有效行时间，请选择普通或增强 LRC 文件。'
      return
    }
    audio.pause()
    seek(0)
    source.value = raw
    sample.value = 'custom'
    lyricsName.value = file.name.replace(/\.lrc$/i, '')
    focusRow.value = 0
    focusPart.value = null
    notice.value = ''
    loadMarks()
  } catch {
    notice.value = '歌词读取失败，请重新选择 UTF-8 编码的 LRC 文件。'
  }
}
function importAudio(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  notice.value = ''
  setAudio(URL.createObjectURL(file), file.name)
}
function keyboard(event) {
  if (event.key === 'Escape') {
    editing.value = false
    immersive.value = false
    follow.value = true
    return
  }
  if (
    editing.value &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'z' &&
    !event.target.closest('input,select,textarea')
  ) {
    event.preventDefault()
    undo()
    return
  }
  if (event.target.closest('button,input,select,textarea,a')) return
  if (event.code === 'Space') {
    event.preventDefault()
    void togglePlay()
  }
}
async function scrollToActive() {
  if (!follow.value || (editing.value && !previewing.value)) return
  await nextTick()
  const row = lyricViewport.value?.querySelector(`[data-row="${activeRow.value}"]`)
  if (!row) return
  const viewport = lyricViewport.value
  viewport.scrollTo({
    top: Math.max(
      0,
      viewport.scrollTop +
        row.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        viewport.clientHeight * 0.38,
    ),
    behavior: reduced.value ? 'instant' : 'smooth',
  })
}
function resumeFollow() {
  follow.value = true
  void scrollToActive()
}
function onMotion(event) {
  reduced.value = event.matches
}
watch(activeRow, scrollToActive)
watch(volume, (value) => {
  audio.volume = Number(value)
})
onMounted(() => {
  loadMarks()
  audio.addEventListener('loadedmetadata', onMetadata)
  audio.addEventListener('canplay', onMetadata)
  audio.addEventListener('play', onPlay)
  audio.addEventListener('pause', onPause)
  audio.addEventListener('ended', onEnded)
  audio.addEventListener('timeupdate', publishTime)
  audio.addEventListener('seeked', publishTime)
  audio.addEventListener('error', onAudioError)
  mediaQuery.addEventListener('change', onMotion)
  document.addEventListener('keydown', keyboard)
  if (audio.readyState >= 1) onMetadata()
})
onBeforeUnmount(() => {
  audio.pause()
  stopFrame()
  audio.src = ''
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  mediaQuery.removeEventListener('change', onMotion)
  document.removeEventListener('keydown', keyboard)
})
// This API belongs to the isolated demo; verification uses the same UI state and media element.
window.emphasisDemo = {
  audio,
  seek,
  preview,
  interval,
  getState: () => ({
    time: time.value,
    playing: playing.value,
    selected: [...selected.value],
    editing: editing.value,
    activeRow: activeRow.value,
    sample: sample.value,
    previewing: previewing.value,
  }),
}
</script>

<template>
  <div class="workspace" :class="{ immersive, editing }" :data-theme="theme">
    <header class="app-header">
      <a class="brand" href="./" aria-label="重新打开歌词强调 Demo"
        ><span class="brand-mark">a</span>Auralis<span class="demo-tag">交互 Demo</span></a
      >
      <div class="header-actions">
        <button
          class="icon-button"
          aria-label="切换深浅主题"
          @click="theme = theme === 'dark' ? 'light' : 'dark'"
        >
          <Icon name="sun" />
        </button>
        <button
          class="icon-button"
          :aria-label="immersive ? '退出聆听预览' : '进入聆听预览'"
          :aria-pressed="immersive"
          @click="immersive = !immersive"
        >
          <Icon :name="immersive ? 'close' : 'expand'" />
        </button>
      </div>
    </header>

    <main class="main-layout">
      <aside class="song-panel">
        <div class="cover" aria-hidden="true">
          <span class="cover-title">慢</span><span class="cover-subtitle">把回声留在窗外</span
          ><span class="cover-line"></span
          ><span class="cover-caption">AURALIS · ORIGINAL STUDY</span>
        </div>
        <div class="song-details">
          <h1>{{ lyricsName }}</h1>
          <p>{{ audioName }}</p>
        </div>
        <div class="sample-switch" aria-label="示例歌词类型">
          <button :aria-pressed="sample === 'enhanced'" @click="chooseSample('enhanced')">
            增强 LRC
          </button>
          <button :aria-pressed="sample === 'plain'" @click="chooseSample('plain')">
            普通 LRC
          </button>
        </div>
        <div class="source-actions">
          <button class="text-button" @click="localAudio.click()">
            <Icon name="note" />选择本地音频
          </button>
          <button class="text-button" @click="localLyrics.click()">
            <Icon name="upload" />选择 LRC 歌词
          </button>
          <input
            ref="localAudio"
            hidden
            type="file"
            accept="audio/*,.flac,.mp3,.m4a,.wav,.ogg,.opus"
            @change="importAudio"
          />
          <input
            ref="localLyrics"
            hidden
            type="file"
            accept=".lrc,.txt,text/plain"
            @change="importLyrics"
          />
        </div>
        <p class="local-note">
          示例为原创歌词与合成伴奏。<br />可载入自己的歌曲和歌词，试听真实演唱。
        </p>
      </aside>

      <section class="lyrics-panel" aria-label="歌词强调工作区">
        <div class="lyrics-heading">
          <div>
            <h2>歌词强调</h2>
            <span class="mode-label"
              >{{ modeLabel }} · {{ editing ? '编辑模式' : '聆听模式' }}</span
            >
          </div>
          <button
            class="edit-button"
            :class="{ 'is-editing': editing }"
            :aria-pressed="editing"
            @click="switchEdit"
          >
            <Icon :name="editing ? 'check' : 'edit'" />{{ editing ? '完成编辑' : '编辑强调' }}
          </button>
        </div>
        <div class="edit-toolbar">
          <p>
            {{
              editing
                ? lines.some((line) => line.segments)
                  ? '点选计时片段，再点一次取消。'
                  : '点击整行，开启或取消强调。'
                : '让选中的文字，随演唱轻轻浮起。'
            }}
          </p>
          <div class="toolbar-actions">
            <span v-if="editing" class="selection-count">已标记 {{ count }} 处</span>
            <button
              v-if="editing"
              class="icon-button"
              :disabled="!history.length"
              title="撤销上次选择"
              aria-label="撤销上次选择"
              @click="undo"
            >
              <Icon name="undo" />
            </button>
          </div>
        </div>
        <div v-if="notice" role="alert" class="notice">{{ notice }}</div>
        <div
          ref="lyricViewport"
          class="lyric-viewport"
          @wheel.passive="follow = false"
          @touchmove.passive="follow = false"
        >
          <div class="lyric-sheet">
            <div
              v-for="(line, row) in lines"
              :key="line.id"
              class="lyric-row"
              :class="{
                'is-current': activeRow === row,
                'is-focused': editing && focusRow === row,
                'is-past': activeRow > row,
              }"
              :data-row="row"
            >
              <button
                class="row-time"
                :aria-label="`选择第 ${row + 1} 行试听`"
                @click="focusLine(row)"
              >
                {{ clock(line.timeSeconds)
                }}<span v-if="editing && focusRow === row" class="focus-dot"></span>
              </button>
              <div class="row-content">
                <template v-if="line.segments">
                  <button
                    v-for="(segment, part) in line.segments"
                    :key="part"
                    class="lyric-unit"
                    :class="{
                      marked: isMarked(row, part),
                      pending: activeRow === row && time < segment.startTimeSeconds,
                    }"
                    :aria-label="`${segment.text}，${editing ? (isMarked(row, part) ? '已强调，点击取消' : '点击强调') : '跳转本行'}`"
                    :aria-pressed="editing ? isMarked(row, part) : undefined"
                    :data-unit="unitKey(row, part)"
                    @click="toggleMark(row, part)"
                  >
                    <span class="unit-text" :style="visual(row, part)">{{ segment.text }}</span>
                  </button>
                </template>
                <button
                  v-else
                  class="lyric-unit whole-line"
                  :class="{ marked: isMarked(row, null) }"
                  :aria-pressed="editing ? isMarked(row, null) : undefined"
                  :data-unit="unitKey(row, null)"
                  @click="toggleMark(row, null)"
                >
                  <span class="unit-text" :style="visual(row, null)">{{
                    line.text || '（间奏）'
                  }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="selection-inspector">
          <div class="selection-info">
            <span>{{ editing ? '当前编辑' : '试听位置' }}</span
            ><strong>{{ selectedLabel }}</strong
            ><small>{{ selectedTiming }}</small>
          </div>
          <div class="inspector-actions">
            <button
              v-if="editing"
              class="text-button clear-line"
              :disabled="![...selected].some((key) => key.startsWith(`${focusRow}:`))"
              @click="clearLine"
            >
              清除此行</button
            ><button class="preview-button" :disabled="!ready || !currentLine" @click="preview">
              <Icon name="replay" />{{ previewing ? '重新试听' : '试听本行' }}
            </button>
          </div>
        </div>
        <div class="workspace-footer">
          <span class="saved" role="status"><Icon name="check" />{{ saveState }}</span
          ><label class="effect-switch"
            ><input v-model="effects" type="checkbox" /><span>强调效果</span></label
          ><button v-if="!follow" class="text-button follow-button" @click="resumeFollow">
            回到当前行
          </button>
        </div>
      </section>
    </main>

    <footer class="player">
      <button
        class="play-button"
        :disabled="!ready"
        :aria-label="playing ? '暂停' : '播放'"
        @click="togglePlay"
      >
        <Icon :name="playing ? 'pause' : 'play'" />
      </button>
      <div class="player-track">
        <div class="player-label">
          <strong>{{ lyricsName }}</strong
          ><span>{{ previewing ? '正在试听本行' : '歌词强调预览' }}</span>
        </div>
        <div class="progress-row">
          <time>{{ clock(time) }}</time
          ><input
            class="progress"
            aria-label="播放进度"
            type="range"
            min="0"
            :max="duration"
            step="0.01"
            :value="time"
            :style="{ '--progress': `${duration ? (time / duration) * 100 : 0}%` }"
            @input="seek($event.target.value)"
          /><time>{{ clock(duration) }}</time>
        </div>
      </div>
      <label class="volume"
        ><Icon name="volume" /><input
          v-model="volume"
          aria-label="音量"
          type="range"
          min="0"
          max="1"
          step="0.01"
      /></label>
    </footer>
    <div v-if="reduced" class="motion-note">已按系统设置减弱动效</div>
  </div>
</template>
