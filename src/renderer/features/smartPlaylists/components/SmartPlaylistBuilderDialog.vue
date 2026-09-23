<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { useSidebarOwnedModal } from '@renderer/app/utils/useSidebarOwnedModal'
import { libraryCatalogClient } from '@renderer/features/library/utils/libraryCatalogClient'
import {
  buildPlaylistRule,
  evaluateBuilder,
  indexBuilderTracks,
  newBuilderState,
  type BuilderField,
} from '../utils/smartPlaylistBuilder'

const props = defineProps<{ open: boolean; trigger: HTMLElement | null }>()
const emit = defineEmits<{ close: []; created: [playlist: SmartPlaylist] }>()
const fields: BuilderField[] = ['genre', 'artist']
const labels = { genre: '流派', artist: '艺术家' }
const icons = { genre: 'i-lucide-list-filter', artist: 'i-lucide-user-round' }
const state = ref(newBuilderState())
const mode = ref<'single' | 'and' | 'or'>('single')
const lastSelectedField = ref<BuilderField>('genre')
const name = ref('我的智能歌单')
const queries = ref({ genre: '', artist: '' })
const limits = ref({ genre: 100, artist: 100 })
const tracks = shallowRef<TrackListItem[]>([])
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const container = ref<HTMLElement | null>(null)
const restoreTrigger = ref<HTMLElement | null>(null)
const activeSingleField = computed(() =>
  fields.find((field) => state.value.groups[field].values.length > 0),
)
const ruleState = computed(() => ({
  ...state.value,
  fields:
    mode.value === 'single' ? fields.filter((field) => field === activeSingleField.value) : fields,
  relation: mode.value === 'or' ? ('or' as const) : ('and' as const),
}))
function isGroupDisabled(field: BuilderField): boolean {
  return mode.value === 'single' && !!activeSingleField.value && activeSingleField.value !== field
}
function selectMode(value: 'single' | 'and' | 'or'): void {
  if (value === 'single' && fields.every((field) => state.value.groups[field].values.length)) {
    const other = lastSelectedField.value === 'genre' ? 'artist' : 'genre'
    state.value.groups[other].values = []
  }
  mode.value = value
  saveError.value = ''
}
function toggleValue(field: BuilderField, value: string): void {
  if (isGroupDisabled(field)) return
  const values = state.value.groups[field].values
  if (values.includes(value)) remove(field, value)
  else {
    values.push(value)
    lastSelectedField.value = field
  }
}
const options = computed(() => indexBuilderTracks(tracks.value))
const result = computed(() => evaluateBuilder(ruleState.value, options.value))
const canCreate = computed(
  () =>
    !loading.value &&
    !saving.value &&
    !loadError.value &&
    !!name.value.trim() &&
    result.value.complete &&
    result.value.ids.size > 0,
)
const filtered = computed(
  () =>
    Object.fromEntries(
      fields.map((field) => [
        field,
        options.value[field].filter((option) =>
          option.label
            .toLocaleLowerCase()
            .includes(queries.value[field].trim().toLocaleLowerCase()),
        ),
      ]),
    ) as Record<BuilderField, typeof options.value.genre>,
)
function label(field: BuilderField, value: string): string {
  return options.value[field].find((option) => option.value === value)?.label ?? value
}
const notice = computed(() => {
  if (!result.value.complete)
    return mode.value === 'single' ? '请选择流派或艺术家' : '请选择每个条件组的具体值'
  if (result.value.ids.size) return ''
  return result.value.groups.some((group) => group.ids.size === 0)
    ? '条件组内无匹配，无法创建'
    : '各条件组之间没有交集，无法创建'
})
function groupCount(field: BuilderField): number {
  return result.value.groups.find((group) => group.field === field)?.ids.size ?? 0
}
function close(): void {
  if (!saving.value) emit('close')
}
useSidebarOwnedModal({
  isOpen: () => props.open,
  container,
  trigger: restoreTrigger,
  canDismiss: () => !saving.value,
  onEscape: close,
})

let disposed = false
let generation = 0
let pending = false
let running = false
let unsubscribe: (() => void) | undefined
async function load(): Promise<void> {
  pending = true
  generation++
  if (running) return
  running = true
  loading.value = true
  try {
    while (pending && props.open && !disposed) {
      pending = false
      const token = generation
      loadError.value = ''
      try {
        const snapshot = await libraryCatalogClient.load(
          () => !disposed && props.open && token === generation,
        )
        if (token === generation && props.open && !disposed) tracks.value = [...snapshot.tracks]
      } catch (cause) {
        if (disposed || !props.open || token !== generation) continue
        loadError.value = '曲库加载失败，请重试'
        rendererDiagnostics.warn({
          scope: 'sidebar.smart-playlist-builder',
          message: 'Failed to load builder catalog',
          cause,
        })
      }
    }
  } finally {
    running = false
    loading.value = false
  }
}
watch(
  () => props.open,
  async (open) => {
    if (!open) {
      generation++
      pending = false
      tracks.value = []
      return
    }
    restoreTrigger.value = props.trigger
    state.value = newBuilderState()
    mode.value = 'single'
    lastSelectedField.value = 'genre'
    name.value = '我的智能歌单'
    queries.value = { genre: '', artist: '' }
    limits.value = { genre: 100, artist: 100 }
    saveError.value = ''
    void load()
    await nextTick()
    container.value?.querySelector<HTMLButtonElement>('.close')?.focus()
  },
)
watch(
  queries,
  () => {
    limits.value = { genre: 100, artist: 100 }
  },
  { deep: true },
)
watch(
  state,
  () => {
    saveError.value = ''
  },
  { deep: true },
)
function remove(field: BuilderField, value: string): void {
  state.value.groups[field].values = state.value.groups[field].values.filter(
    (item) => item !== value,
  )
}
async function create(): Promise<void> {
  if (!canCreate.value) return
  saving.value = true
  saveError.value = ''
  try {
    // Recheck against a fresh complete snapshot before persisting the dynamic rule.
    libraryCatalogClient.invalidate()
    await load()
    if (disposed || !props.open || loadError.value) return
    const current = evaluateBuilder(ruleState.value, indexBuilderTracks(tracks.value))
    if (!current.complete || !current.ids.size) {
      saveError.value = '当前条件没有匹配歌曲，请调整后重试'
      return
    }
    const created = await auralis.smartPlaylists.create(
      name.value.trim(),
      buildPlaylistRule(ruleState.value),
    )
    if (disposed) return
    window.dispatchEvent(new CustomEvent('auralis-smart-playlists-changed'))
    emit('created', created.playlist)
    emit('close')
  } catch (cause) {
    saveError.value = '创建失败，请重试'
    rendererDiagnostics.warn({
      scope: 'sidebar.smart-playlist-builder',
      message: 'Failed to create smart playlist',
      cause,
    })
  } finally {
    saving.value = false
  }
}
onMounted(() => {
  unsubscribe = auralis.library.onChanged((event) => {
    if (!props.open || event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset')
      return
    libraryCatalogClient.invalidate()
    void load()
  })
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  pending = false
  unsubscribe?.()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sidebar-overlay builder-backdrop" @click.self="close">
      <section
        ref="container"
        class="playlist-builder"
        role="dialog"
        aria-modal="true"
        aria-labelledby="playlist-builder-title"
        :aria-busy="saving"
      >
        <header>
          <div class="title-lockup">
            <span class="i-lucide-sparkles" />
            <h1 id="playlist-builder-title">新建智能歌单</h1>
          </div>
          <button class="close" aria-label="关闭" :disabled="saving" @click="close">
            <span class="i-lucide-x" />
          </button>
        </header>
        <div class="stage">
          <p v-if="loading" class="notice neutral" role="status">正在读取曲库…</p>
          <p v-if="loadError" class="notice" role="alert">
            {{ loadError }} <button :disabled="loading || saving" @click="load">重试</button>
          </p>
          <fieldset :disabled="saving || loading || !!loadError" class="controls">
            <div class="relation outer">
              <span class="label">组间关系</span>
              <div class="switch" role="group" aria-label="不同维度之间的关系">
                <button
                  type="button"
                  :aria-pressed="mode === 'single'"
                  @click="selectMode('single')"
                >
                  单选
                </button>
                <button type="button" :aria-pressed="mode === 'and'" @click="selectMode('and')">
                  和 · 同时满足</button
                ><button type="button" :aria-pressed="mode === 'or'" @click="selectMode('or')">
                  或 · 满足任一
                </button>
              </div>
            </div>
            <div class="condition-groups parallel-groups">
              <fieldset
                v-for="field in fields"
                :key="field"
                class="group"
                :class="{ 'group-disabled': isGroupDisabled(field) }"
                :disabled="isGroupDisabled(field)"
                :aria-label="labels[field]"
              >
                <div class="group-header">
                  <h2><span :class="icons[field]" />{{ labels[field] }}</h2>
                  <span
                    class="badge"
                    :class="{ empty: state.groups[field].values.length && !groupCount(field) }"
                    >{{
                      state.groups[field].values.length ? `${groupCount(field)} 首匹配` : '未选择'
                    }}</span
                  >
                </div>
                <div class="relation">
                  <span class="label">组内关系</span>
                  <div class="switch" role="group" :aria-label="`${labels[field]}组内关系`">
                    <button
                      :aria-pressed="state.groups[field].relation === 'and'"
                      @click="state.groups[field].relation = 'and'"
                    >
                      和</button
                    ><button
                      :aria-pressed="state.groups[field].relation === 'or'"
                      @click="state.groups[field].relation = 'or'"
                    >
                      或
                    </button>
                  </div>
                </div>
                <div
                  v-if="state.groups[field].values.length"
                  class="selected-values"
                  :aria-label="`已选${labels[field]}`"
                >
                  <button
                    v-for="value in state.groups[field].values"
                    :key="value"
                    class="chip"
                    :aria-label="`移除 ${label(field, value)}`"
                    @click="remove(field, value)"
                  >
                    <span>{{ label(field, value) }}</span
                    ><span class="i-lucide-x" /></button
                  ><button class="clear-group" @click="state.groups[field].values = []">
                    清空
                  </button>
                </div>
                <div class="search-wrap">
                  <span class="i-lucide-search" /><input
                    v-model="queries[field]"
                    class="search"
                    :placeholder="`检索${labels[field]}`"
                    :aria-label="`检索${labels[field]}`"
                  /><button
                    v-if="queries[field]"
                    class="clear-search"
                    :aria-label="`清除${labels[field]}检索`"
                    @click="queries[field] = ''"
                  >
                    <span class="i-lucide-x" />
                  </button>
                </div>
                <div class="choices">
                  <label
                    v-for="option in filtered[field].slice(0, limits[field])"
                    :key="option.value"
                    class="choice"
                    ><input
                      :checked="state.groups[field].values.includes(option.value)"
                      type="checkbox"
                      :value="option.value"
                      @change="toggleValue(field, option.value)"
                    /><span>{{ option.label }}</span
                    ><small>{{ option.ids.size }}</small></label
                  ><button
                    v-if="filtered[field].length > limits[field]"
                    class="more"
                    @click="limits[field] += 100"
                  >
                    显示更多（{{ filtered[field].length - limits[field] }}）
                  </button>
                </div>
                <p v-if="!filtered[field].length" class="notice neutral">没有找到相应的值</p>
              </fieldset>
            </div>
          </fieldset>
        </div>
        <div class="actions">
          <input
            v-model="name"
            class="name"
            aria-label="歌单名称"
            placeholder="歌单名称"
            maxlength="80"
            :disabled="saving"
          />
          <div class="match-summary" role="status" aria-live="polite">
            <span
              >匹配歌曲 <strong>{{ result.ids.size }}</strong> 首</span
            >
            <span v-if="notice" class="match-notice" :class="{ neutral: !result.complete }">
              {{ notice }}
            </span>
          </div>
          <button class="primary" :disabled="!canCreate" @click="create">
            {{ saving ? '正在创建…' : '创建歌单' }}
          </button>
        </div>
        <p v-if="saveError" class="status" role="alert">{{ saveError }}</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.builder-backdrop {
  position: fixed;
  inset: 0;
  z-index: 92;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #08090b66;
  padding: 24px;
}
.playlist-builder {
  --text: #f3eee6;
  --muted: #afb4bc;
  --subtle: #9299a3;
  --line: #e1ddd614;
  width: min(880px, 100%);
  border-radius: 20px;
  background: var(--auralis-frosted-surface-bg, rgba(24, 26, 29, 0.9));
  backdrop-filter: var(--auralis-frosted-surface-filter, blur(24px));
  color: var(--text);
  overflow: hidden;
  box-shadow: none;
}
.controls {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.more {
  grid-column: 1/-1;
  font-size: 12px;
  padding: 10px;
  color: var(--muted);
}
@media (prefers-reduced-transparency: reduce) {
  .playlist-builder {
    background: #1b1d21;
    backdrop-filter: none;
  }
  .builder-backdrop {
    backdrop-filter: none;
  }
}

* {
  box-sizing: border-box;
}
button,
input {
  font: inherit;
}
button {
  cursor: pointer;
  border: 0;
  background: none;
  color: inherit;
}
button:disabled {
  cursor: default;
  color: #afb4bc59;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid #8fa7bb;
  outline-offset: 3px;
}
.playlist-builder {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 48px);
  height: auto;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 8px;
  flex-shrink: 0;
  gap: 20px;
}
.title-lockup {
  display: flex;
  gap: 12px;
  align-items: center;
}
.title-lockup > span {
  color: var(--muted);
}
h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.4px;
}
.close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--subtle);
}
.close:hover {
  color: var(--text);
}
.stage {
  padding: 12px 24px 8px;
  flex: 0 1 auto;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: #484d55 transparent;
}
h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 20px;
}
input[type='checkbox'] {
  appearance: none;
  width: 17px;
  height: 17px;
  border: 1px solid #9299a380;
  border-radius: 4px;
  margin: 0;
  display: grid;
  place-content: center;
  flex-shrink: 0;
  cursor: pointer;
  background: transparent;
}
input[type='checkbox']:checked {
  background: #8fa7bb;
  border-color: #8fa7bb;
}
input[type='checkbox']:checked::after {
  content: '';
  width: 8px;
  height: 4px;
  border-left: 1.8px solid #111214;
  border-bottom: 1.8px solid #111214;
  transform: translateY(-1px) rotate(-45deg);
}
.choice:has(:checked) {
  background: #8fa7bb1a;
}
.choice:hover {
  background: #e1ddd60f;
}
.relation {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.outer {
  padding: 0 0 10px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 14px;
  justify-content: space-between;
}
.label {
  font-size: 12px;
  color: var(--muted);
}
.outer .label {
  font-size: 13px;
  color: var(--text);
}
.switch {
  display: inline-flex;
  gap: 4px;
}
.switch button {
  padding: 6px 11px;
  font-size: 12px;
  border-radius: 8px;
  color: var(--subtle);
  white-space: nowrap;
}
.switch button[aria-pressed='true'] {
  background: #8fa7bb19;
  color: var(--text);
}
.switch button:hover:not(:disabled) {
  color: var(--text);
  background: #e1ddd60f;
}
.switch button:disabled {
  opacity: 0.35;
}
.condition-groups.parallel-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px;
  align-items: start;
}
.group {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.group-disabled {
  opacity: 0.35;
  pointer-events: none;
}
.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.group-header h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}
.group-header h2 > span {
  width: 16px;
  height: 16px;
  color: var(--muted);
}
.group .relation {
  justify-content: space-between;
  margin-bottom: 14px;
}
.badge {
  color: var(--subtle);
  font-size: 11px;
  white-space: nowrap;
}
.badge.empty {
  color: #e5a5a0;
}
.selected-values {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  min-height: 28px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  border: 0;
  background: #e1ddd614;
  border-radius: 8px;
  padding: 5px 7px;
  color: var(--text);
  max-width: 100%;
}
.chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip > span:first-child {
  font-weight: 600;
}
.chip .i-lucide-x {
  width: 12px;
  height: 12px;
  color: var(--subtle);
}
.clear-group {
  font-size: 11px;
  color: var(--subtle);
  padding: 4px 6px;
}
.search-wrap {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  background: #e1ddd60a;
  border-radius: 10px;
  margin-bottom: 10px;
}
.search-wrap > span {
  color: var(--subtle);
  width: 16px;
  height: 16px;
}
.search-wrap:focus-within {
  outline: 1px solid #9299a3;
}
.search {
  width: 100%;
  min-width: 0;
  padding: 10px 0;
  border: 0;
  background: none;
  color: var(--text);
  font-size: 12px;
}
.search:focus-visible {
  outline: none;
}
.search::placeholder {
  color: var(--subtle);
}
.clear-search {
  display: grid;
  place-items: center;
  color: var(--subtle);
  width: 24px;
  height: 28px;
  padding: 0;
}
.clear-search > span {
  width: 14px;
  height: 14px;
}
.choices {
  --choice-row-height: 38px;
  --choice-row-gap: 2px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: var(--choice-row-height);
  gap: var(--choice-row-gap) 8px;
  max-height: calc(4 * var(--choice-row-height) + 3 * var(--choice-row-gap));
  overflow: auto;
  scroll-snap-type: y mandatory;
  scrollbar-width: thin;
  scrollbar-color: #484d55 transparent;
}
.choices > * {
  scroll-snap-align: start;
}
.choice {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 7px;
  min-height: var(--choice-row-height);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  min-width: 0;
}
.choice span {
  flex: 1;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.choice small {
  color: var(--subtle);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.choice input[type='checkbox'] {
  width: 15px;
  height: 15px;
  border-radius: 3px;
}
.match-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: auto;
  text-align: right;
  color: var(--muted);
  font-size: 12px;
}
.match-summary strong {
  color: var(--text);
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.match-notice {
  color: #e5a5a0;
  font-size: 11px;
}
.match-notice.neutral {
  color: var(--subtle);
}
.match-summary + .primary {
  margin-left: 0;
}
.notice {
  font-size: 12px;
  line-height: 1.7;
  color: #e5a5a0;
  margin: 12px 0;
}
.notice.neutral {
  color: var(--subtle);
}
.actions {
  padding: 16px 24px 22px;
  display: flex;
  gap: 14px;
  align-items: center;
  flex-shrink: 0;
}
.primary {
  margin-left: auto;
  background: #8fa7bb;
  color: #111214;
  padding: 11px 20px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.primary:disabled {
  color: #afb4bc59;
  background: #e1ddd60d;
}
.primary:hover:not(:disabled) {
  background: #a3bbc9;
}
.name {
  width: 240px;
  min-width: 0;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: #e1ddd60a;
  color: var(--text);
  font-size: 12px;
}
.name::placeholder {
  color: var(--subtle);
}
.name:focus-visible {
  outline: none;
  background: #8fa7bb14;
}
.status {
  margin: 0;
  padding: 0 30px 18px;
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 760px) {
  header {
    padding: 18px 20px 8px;
  }
  h1 {
    font-size: 19px;
  }
  .stage {
    padding: 12px 20px 8px;
  }
  .condition-groups.parallel-groups {
    grid-template-columns: 1fr;
  }
  .actions {
    padding: 16px 20px;
    flex-wrap: wrap;
  }
  .name {
    flex: 1;
    width: 160px;
  }
}
</style>
