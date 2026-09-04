<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'

import {
  type EditorialLinerNotesData,
  computeArchiveChecksum,
  formatLinerDuration,
  formatPeakDateNarrative,
  formatReceiptActiveDays,
  formatReceiptDailyAverage,
  formatReceiptPeakLog,
  formatReceiptPlays,
} from '@renderer/features/archive/utils/editorialLinerNotes'

const props = defineProps<{
  data: EditorialLinerNotesData
}>()

const emit = defineEmits<{
  (e: 'click-peak', event: MouseEvent | KeyboardEvent, date: string): void
  (e: 'open-recap'): void
  (e: 'reset'): void
}>()

const { t, locale } = useI18n()
const { visualStyle } = useVisualStyle()

const isEn = computed(() => locale.value.startsWith('en'))
const currentTheme = computed(() => (visualStyle.value === 'manuscript' ? 'manuscript' : 'modern'))
const emptyNarrative = computed(() => t('archive.linerNotes.emptyNarrative'))

const isPending = computed(
  () =>
    Boolean(props.data.isPending) || (props.data.activeDays === 0 && props.data.totalPlays === 0),
)

const checksum = computed(() =>
  computeArchiveChecksum(props.data.year, props.data.totalPlays, props.data.activeDays),
)
const checksumPrefix = computed(() => checksum.value.slice(0, 4))

const durationInfo = computed(() => formatLinerDuration(props.data.totalDurationSeconds))
const totalHours = computed(() => durationInfo.value.hours)
const totalMinutes = computed(() => durationInfo.value.minutesFormatted)

const peakDateFormatted = computed(() =>
  formatPeakDateNarrative(props.data.peakDayDate, isEn.value),
)

const paddedActiveDays = computed(() => formatReceiptActiveDays(props.data.activeDays))
const paddedTotalPlays = computed(() => formatReceiptPlays(props.data.totalPlays))
const paddedDurationMinutes = computed(() => String(durationInfo.value.rawMinutes).padStart(4, '0'))
const paddedDailyAverage = computed(() =>
  formatReceiptDailyAverage(props.data.activeDays, props.data.totalPlays),
)
const paddedPeakText = computed(() =>
  formatReceiptPeakLog(props.data.peakDayDate, props.data.peakDayPlays),
)

function formatNumber(num: number): string {
  return (num || 0).toLocaleString('en-US')
}

function emitPeakClick(event: MouseEvent | KeyboardEvent): void {
  if (props.data.peakDayDate && !isPending.value) {
    emit('click-peak', event, props.data.peakDayDate)
  }
}
</script>

<template>
  <article
    class="editorial-liner-notes"
    :data-theme="currentTheme"
    :class="{ 'is-pending': isPending }"
  >
    <!-- 1. 左侧：档案正文卡（Narrative Card） -->
    <section class="liner-card-narrative">
      <!-- 顶部档案徽标 -->
      <header class="narrative-header">
        <div class="narrative-header-left">
          <span
            class="narrative-badge"
            role="button"
            tabindex="0"
            @contextmenu.prevent="emit('reset')"
          >
            ANNUAL NOTES · {{ data.year }} ARCHIVE
          </span>
          <button
            v-if="!isPending"
            type="button"
            class="narrative-recap-btn"
            @click="emit('open-recap')"
          >
            <span class="i-lucide-sparkles inline-block h-3.5 w-3.5"></span>
            <span>{{ t('archive.annualRecap') }}</span>
          </button>
        </div>
        <span class="narrative-serial">NO. #AUR-{{ data.year }}-{{ checksumPrefix }}</span>
      </header>

      <!-- 叙事正文流 -->
      <div class="narrative-body">
        <template v-if="!isPending">
          <template v-if="isEn">
            Over the past year, you pressed play across
            <span class="narrative-highlight">{{ data.activeDays }}</span>
            days and nights, resonating with melodies
            <span class="narrative-highlight">{{ formatNumber(data.totalPlays) }}</span>
            times. Sound flowed for
            <span class="narrative-highlight">{{ totalHours }} hours</span>
            ({{ totalMinutes }} minutes); you were immersed deepest on
            <span
              class="narrative-highlight"
              :class="{ 'narrative-highlight--clickable': Boolean(data.peakDayDate) }"
              :role="data.peakDayDate ? 'button' : undefined"
              :tabindex="data.peakDayDate ? 0 : undefined"
              @click="emitPeakClick($event)"
              @keydown.enter.prevent="emitPeakClick($event)"
              @keydown.space.prevent="emitPeakClick($event)"
            >
              {{ peakDateFormatted }}
            </span>
            leaving a single-day record of
            <span class="narrative-highlight">{{ data.peakDayPlays || 0 }}</span>
            plays.
          </template>
          <template v-else>
            在过去的一年中，你在
            <span class="narrative-highlight">{{ data.activeDays }}</span>
            个日夜里按下了播放键，与旋律共鸣
            <span class="narrative-highlight">{{ formatNumber(data.totalPlays) }}</span>
            次。声音一共流淌了
            <span class="narrative-highlight">{{ totalHours }}小时</span>
            （{{ totalMinutes }} 分钟）；其中在
            <span
              class="narrative-highlight"
              :class="{ 'narrative-highlight--clickable': Boolean(data.peakDayDate) }"
              :role="data.peakDayDate ? 'button' : undefined"
              :tabindex="data.peakDayDate ? 0 : undefined"
              @click="emitPeakClick($event)"
              @keydown.enter.prevent="emitPeakClick($event)"
              @keydown.space.prevent="emitPeakClick($event)"
            >
              {{ peakDateFormatted }}
            </span>
            这一天你沉浸最深，留下了
            <span class="narrative-highlight">{{ data.peakDayPlays || 0 }}</span>
            次单日播放记录。
          </template>
        </template>
        <template v-else>
          <span>{{ emptyNarrative }}</span>
        </template>
      </div>

      <!-- 底部档案元数据 -->
      <footer class="narrative-footer">
        <span class="archive-id">ARCHIVE-ID: #AUR-{{ data.year }}-{{ checksumPrefix }}</span>
        <span class="archive-status">
          STATUS: {{ isPending ? 'PENDING' : 'VERIFIED & ARCHIVED' }}
        </span>
      </footer>
    </section>

    <!-- 2. 中间：物理穿孔缝线与半圆打孔槽（Perforation Seam） -->
    <div class="liner-card-perforation" aria-hidden="true">
      <div class="punch-notch punch-notch--top"></div>
      <div class="perforation-dash-line"></div>
      <div class="punch-notch punch-notch--bottom"></div>
    </div>

    <!-- 3. 右侧：审计小票副券（Receipt Voucher） -->
    <aside class="liner-card-receipt">
      <!-- 倾斜防伪验印章 -->
      <div class="inspection-stamp" :class="{ 'is-pending': isPending }">
        <div class="stamp-inner">
          <span class="stamp-org">AURALIS AUDIT</span>
          <span class="stamp-status">{{ isPending ? 'PENDING' : 'AUDITED' }}</span>
          <span class="stamp-date">{{ data.year }}.12.31</span>
        </div>
      </div>

      <!-- 小票表头 -->
      <div class="receipt-header">
        <span class="receipt-title">* METRICS RECEIPT *</span>
        <span class="receipt-divider">-------------------------</span>
      </div>

      <!-- 点阵式等宽清单 -->
      <dl class="receipt-itemized-list">
        <div class="receipt-row">
          <dt>ACTIVE DAYS</dt>
          <dd>{{ paddedActiveDays }}</dd>
        </div>
        <div class="receipt-row">
          <dt>TOTAL PLAYS</dt>
          <dd>{{ paddedTotalPlays }}</dd>
        </div>
        <div class="receipt-row">
          <dt>TOTAL DURATION</dt>
          <dd>{{ paddedDurationMinutes }} M</dd>
        </div>
        <div class="receipt-row">
          <dt>DAILY AVERAGE</dt>
          <dd>{{ paddedDailyAverage }}</dd>
        </div>
        <div
          class="receipt-row"
          :class="{ 'receipt-row--clickable': !isPending && Boolean(data.peakDayDate) }"
          :role="!isPending && Boolean(data.peakDayDate) ? 'button' : undefined"
          :tabindex="!isPending && Boolean(data.peakDayDate) ? 0 : undefined"
          @click="emitPeakClick($event)"
          @keydown.enter.prevent="emitPeakClick($event)"
          @keydown.space.prevent="emitPeakClick($event)"
        >
          <dt>PEAK LOG</dt>
          <dd>{{ paddedPeakText }}</dd>
        </div>
      </dl>

      <!-- 小票底部条形码与校验和 -->
      <div class="receipt-footer">
        <span class="receipt-divider">-------------------------</span>
        <div class="receipt-barcode-wrap">
          <svg class="receipt-barcode-svg" viewBox="0 0 160 28" fill="currentColor">
            <rect x="0" y="0" width="2" height="28" />
            <rect x="4" y="0" width="1" height="28" />
            <rect x="7" y="0" width="3" height="28" />
            <rect x="12" y="0" width="2" height="28" />
            <rect x="16" y="0" width="1" height="28" />
            <rect x="19" y="0" width="4" height="28" />
            <rect x="25" y="0" width="1" height="28" />
            <rect x="28" y="0" width="2" height="28" />
            <rect x="32" y="0" width="3" height="28" />
            <rect x="37" y="0" width="1" height="28" />
            <rect x="40" y="0" width="4" height="28" />
            <rect x="46" y="0" width="2" height="28" />
            <rect x="50" y="0" width="1" height="28" />
            <rect x="53" y="0" width="3" height="28" />
            <rect x="58" y="0" width="2" height="28" />
            <rect x="62" y="0" width="4" height="28" />
            <rect x="68" y="0" width="1" height="28" />
            <rect x="71" y="0" width="2" height="28" />
            <rect x="75" y="0" width="3" height="28" />
            <rect x="80" y="0" width="1" height="28" />
            <rect x="83" y="0" width="4" height="28" />
            <rect x="89" y="0" width="2" height="28" />
            <rect x="93" y="0" width="1" height="28" />
            <rect x="96" y="0" width="3" height="28" />
            <rect x="101" y="0" width="2" height="28" />
            <rect x="105" y="0" width="4" height="28" />
            <rect x="111" y="0" width="1" height="28" />
            <rect x="114" y="0" width="2" height="28" />
            <rect x="118" y="0" width="3" height="28" />
            <rect x="123" y="0" width="1" height="28" />
            <rect x="126" y="0" width="4" height="28" />
            <rect x="132" y="0" width="2" height="28" />
            <rect x="136" y="0" width="1" height="28" />
            <rect x="139" y="0" width="3" height="28" />
            <rect x="144" y="0" width="2" height="28" />
            <rect x="148" y="0" width="4" height="28" />
            <rect x="154" y="0" width="1" height="28" />
            <rect x="157" y="0" width="3" height="28" />
          </svg>
        </div>
        <div class="receipt-crc">CRC-32: {{ checksum }}</div>
      </div>
    </aside>
  </article>
</template>

<style scoped>
.editorial-liner-notes {
  --liner-radius: 16px;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) auto minmax(260px, 1fr);
  width: 100%;
  border-radius: var(--liner-radius);
  overflow: visible;
  position: relative;
  transition:
    transform 300ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 300ms ease;
  user-select: none;
}

/* 1. Manuscript 皮肤 */
.editorial-liner-notes[data-theme='manuscript'] {
  --liner-bg-left: #fdfbf7;
  --liner-bg-right: #f6f0e4;
  --liner-text-primary: #33261d;
  --liner-text-secondary: #857567;
  --liner-accent: #a3412f;
  --liner-border: var(--manuscript-hairline-width, 1px) solid
    var(--manuscript-border-ledger, #d8cebf);
  --liner-dash-color: #c9bcab;
  --liner-stamp-color: #a3412f;
  --liner-stamp-border: 1.5px dashed rgba(163, 65, 47, 0.65);
  --liner-barcode-ink: #3b2c22;
  --liner-notch-bg: var(--manuscript-surface-page, #f7f3ec);
  --liner-shadow: 0 16px 36px rgba(60, 44, 30, 0.08);
  --liner-shadow-hover: 0 22px 46px rgba(60, 44, 30, 0.12);
  --liner-font-body: var(--manuscript-font-body, 'Auralis Desktop Lyrics SC', Georgia, serif);
  --liner-font-ui: var(--manuscript-font-ui, 'Auralis Sans SC', system-ui, sans-serif);
  --liner-font-mono: 'Courier New', Courier, monospace;
  --liner-font-number: var(--manuscript-font-numeric, 'Auralis Sans SC', sans-serif);
}

/* 2. Modern 皮肤 */
.editorial-liner-notes[data-theme='modern'] {
  --liner-bg-left: rgba(24, 22, 20, 0.65);
  --liner-bg-right: rgba(31, 28, 25, 0.85);
  --liner-text-primary: #f5ede6;
  --liner-text-secondary: #8c8278;
  --liner-accent: #4f8cff;
  --liner-border: 1px solid rgba(255, 255, 255, 0.08);
  --liner-dash-color: rgba(255, 255, 255, 0.12);
  --liner-stamp-color: #4f8cff;
  --liner-stamp-border: 1.5px solid rgba(79, 140, 255, 0.6);
  --liner-barcode-ink: rgba(245, 237, 230, 0.7);
  --liner-notch-bg: var(--auralis-bg, #121212);
  --liner-shadow: 0 20px 48px rgba(0, 0, 0, 0.55);
  --liner-shadow-hover: 0 26px 60px rgba(0, 0, 0, 0.68);
  --liner-font-body:
    'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --liner-font-ui: 'Outfit', 'Inter', system-ui, sans-serif;
  --liner-font-mono: 'JetBrains Mono', 'Consolas', monospace;
  --liner-font-number: 'Outfit', 'Inter', system-ui, sans-serif;
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
}

.editorial-liner-notes {
  box-shadow: var(--liner-shadow);
}

.editorial-liner-notes:hover {
  transform: translateY(-2px);
  box-shadow: var(--liner-shadow-hover);
}

/* ============================================================
   左侧：档案正文卡（Narrative Card）
   ============================================================ */
.liner-card-narrative {
  background: var(--liner-bg-left);
  border: var(--liner-border);
  border-right: none;
  border-radius: var(--liner-radius) 0 0 var(--liner-radius);
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 20px;
  position: relative;
  font-family: var(--liner-font-body);
}

.narrative-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--liner-font-ui);
}

.narrative-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.narrative-recap-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-family: var(--liner-font-ui);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 180ms ease;
  user-select: none;
}

.editorial-liner-notes[data-theme='manuscript'] .narrative-recap-btn {
  border: var(--manuscript-hairline-width, 1px) solid var(--liner-accent);
  color: var(--liner-accent);
  background: transparent;
}

.editorial-liner-notes[data-theme='manuscript'] .narrative-recap-btn:hover {
  background: rgba(163, 65, 47, 0.08);
  transform: translateY(-1px);
}

.editorial-liner-notes[data-theme='modern'] .narrative-recap-btn {
  border: 1px solid rgba(79, 140, 255, 0.4);
  color: #4f8cff;
  background: rgba(79, 140, 255, 0.08);
}

.editorial-liner-notes[data-theme='modern'] .narrative-recap-btn:hover {
  background: rgba(79, 140, 255, 0.2);
  border-color: #4f8cff;
  transform: translateY(-1px);
}

.narrative-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--liner-accent);
  text-transform: uppercase;
  font-family: var(--liner-font-ui);
}

.narrative-serial {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--liner-text-secondary);
  font-family: var(--liner-font-mono);
}

.narrative-body {
  font-size: 15px;
  line-height: 1.85;
  color: var(--liner-text-primary);
  font-family: var(--liner-font-body);
}

.editorial-liner-notes.is-pending .narrative-body {
  color: var(--liner-text-secondary);
  font-style: italic;
}

.narrative-highlight {
  font-weight: 700;
  color: var(--liner-text-primary);
  border-bottom: 2px solid var(--liner-accent);
  padding-bottom: 1px;
  font-family: var(--liner-font-number);
  font-feature-settings: 'tnum';
}

.narrative-highlight--clickable {
  cursor: pointer;
  transition:
    opacity 160ms ease,
    transform 160ms ease;
  display: inline-block;
}

.narrative-highlight--clickable:hover {
  opacity: 0.82;
  transform: translateY(-1px);
}

.narrative-highlight--clickable:focus-visible {
  outline: 2px solid var(--liner-accent);
  outline-offset: 2px;
  border-radius: 2px;
}

.narrative-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-family: var(--liner-font-ui);
  color: var(--liner-text-secondary);
  border-top: 1px solid var(--liner-dash-color);
  padding-top: 12px;
}

.archive-id {
  letter-spacing: 0.08em;
  font-family: var(--liner-font-mono);
}

.archive-status {
  font-weight: 700;
  letter-spacing: 0.08em;
  font-family: var(--liner-font-ui);
}

/* ============================================================
   中间：物理穿孔与打孔槽（Perforation Seam）
   ============================================================ */
.liner-card-perforation {
  position: relative;
  width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.perforation-dash-line {
  width: 0;
  height: 100%;
  border-left: 1.5px dashed var(--liner-dash-color);
}

.punch-notch {
  width: 20px;
  height: 10px;
  background-color: var(--liner-notch-bg);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
}

.punch-notch--top {
  top: -1px;
  border-bottom-left-radius: 20px;
  border-bottom-right-radius: 20px;
  box-shadow: inset 0 -2px 3px rgba(0, 0, 0, 0.12);
}

.punch-notch--bottom {
  bottom: -1px;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  box-shadow: inset 0 2px 3px rgba(0, 0, 0, 0.12);
}

/* ============================================================
   右侧：审计小票副券（Receipt Voucher）
   ============================================================ */
.liner-card-receipt {
  background: var(--liner-bg-right);
  border: var(--liner-border);
  border-left: none;
  border-radius: 0 var(--liner-radius) var(--liner-radius) 0;
  padding: 24px 28px;
  position: relative;
  font-family: var(--liner-font-mono);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  overflow: hidden;
}

/* 倾斜防伪验印章 */
.inspection-stamp {
  position: absolute;
  top: 14px;
  right: 18px;
  pointer-events: none;
  border: var(--liner-stamp-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--liner-stamp-color);
  transform: rotate(-14deg);
  transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center center;
  user-select: none;
  z-index: 4;
  font-family: var(--liner-font-ui);
}

.editorial-liner-notes:hover .inspection-stamp {
  transform: rotate(-11deg) scale(1.03);
}

.editorial-liner-notes[data-theme='manuscript'] .inspection-stamp {
  mix-blend-mode: multiply;
}

.editorial-liner-notes[data-theme='modern'] .inspection-stamp {
  box-shadow: 0 0 10px rgba(79, 140, 255, 0.2);
}

.stamp-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.15;
}

.stamp-org {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.14em;
  opacity: 0.85;
  font-family: var(--liner-font-ui);
}

.stamp-status {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  font-family: var(--liner-font-ui);
}

.stamp-date {
  font-size: 8px;
  opacity: 0.8;
  letter-spacing: 0.06em;
  font-family: var(--liner-font-mono);
}

/* 小票表头 */
.receipt-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.receipt-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--liner-text-secondary);
  text-align: center;
  font-family: var(--liner-font-ui);
}

.receipt-divider {
  font-size: 10px;
  color: var(--liner-dash-color);
  overflow: hidden;
  letter-spacing: -0.05em;
  text-align: center;
}

/* 点阵清单 */
.receipt-itemized-list {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.receipt-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  line-height: 1.4;
}

.receipt-row dt {
  color: var(--liner-text-secondary);
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.05em;
  font-family: var(--liner-font-mono);
}

.receipt-row dd {
  color: var(--liner-text-primary);
  font-weight: 600;
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  font-family: var(--liner-font-mono);
}

.receipt-row--clickable {
  cursor: pointer;
  border-radius: 4px;
  padding: 1px 4px;
  margin: 0 -4px;
  transition: background-color 150ms ease;
}

.receipt-row--clickable:hover {
  background-color: rgba(163, 65, 47, 0.08);
}

.editorial-liner-notes[data-theme='modern'] .receipt-row--clickable:hover {
  background-color: rgba(79, 140, 255, 0.12);
}

.receipt-row--clickable:focus-visible {
  outline: 1.5px solid var(--liner-accent);
  outline-offset: 1px;
}

/* 小票底部与条形码 */
.receipt-footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.receipt-barcode-wrap {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: 160px;
}

.receipt-barcode-svg {
  width: 100%;
  max-width: 160px;
  height: 28px;
  color: var(--liner-barcode-ink);
}

/* Modern 皮肤下的条形码扫光微交互 */
.editorial-liner-notes[data-theme='modern'] .receipt-barcode-wrap::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(79, 140, 255, 0.3) 50%, transparent 100%);
  transform: translateX(-100%);
  pointer-events: none;
}

.editorial-liner-notes[data-theme='modern']:hover .receipt-barcode-wrap::after {
  animation: barcode-shimmer 800ms ease forwards;
}

@keyframes barcode-shimmer {
  to {
    transform: translateX(100%);
  }
}

.receipt-crc {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--liner-text-secondary);
  font-variant-numeric: tabular-nums;
  font-family: var(--liner-font-mono);
}

/* ============================================================
   响应式折叠与容器查询
   ============================================================ */
@container (max-width: 760px) {
  .editorial-liner-notes {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
  }

  .liner-card-narrative {
    border-right: var(--liner-border);
    border-bottom: none;
    border-radius: var(--liner-radius) var(--liner-radius) 0 0;
    padding: 24px 20px;
  }

  .liner-card-receipt {
    border-left: var(--liner-border);
    border-top: none;
    border-radius: 0 0 var(--liner-radius) var(--liner-radius);
    padding: 20px;
  }

  /* 穿孔缝线旋转 90 度为水平撕裂槽 */
  .liner-card-perforation {
    width: 100%;
    height: 18px;
    flex-direction: row;
    position: relative;
  }

  .perforation-dash-line {
    width: 100%;
    height: 1px;
    border-left: 0;
    border-top: 1.5px dashed var(--liner-dash-color);
  }

  .punch-notch--top {
    left: -1px;
    top: 50%;
    transform: translateY(-50%);
    width: 10px;
    height: 20px;
    border-top-right-radius: 20px;
    border-bottom-right-radius: 20px;
    border-bottom-left-radius: 0;
    border-top-left-radius: 0;
    box-shadow: inset -2px 0 3px rgba(0, 0, 0, 0.12);
  }

  .punch-notch--bottom {
    right: -1px;
    left: auto;
    top: 50%;
    transform: translateY(-50%);
    width: 10px;
    height: 20px;
    border-top-left-radius: 20px;
    border-bottom-left-radius: 20px;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    box-shadow: inset 2px 0 3px rgba(0, 0, 0, 0.12);
  }
}

/* ============================================================
   辅助功能与动效降级
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  .editorial-liner-notes,
  .inspection-stamp,
  .editorial-liner-notes[data-theme='modern'] .receipt-barcode-wrap::after,
  .narrative-highlight--clickable {
    transition: none !important;
    transform: none !important;
    animation: none !important;
  }
}
</style>
