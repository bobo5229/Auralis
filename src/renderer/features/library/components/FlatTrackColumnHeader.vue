<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  LIBRARY_FLAT_COLUMN_IDS,
  LIBRARY_FLAT_COLUMN_MAX_WIDTHS,
  LIBRARY_FLAT_COLUMN_MIN_WIDTHS,
  resizeAdjacentLibraryColumns,
  type LibraryFlatColumnId,
  type LibraryFlatColumnLayout,
  type LibraryFlatColumnWidths,
} from '../utils/libraryFlatColumnLayout'

const props = defineProps<{
  layout: LibraryFlatColumnLayout
  resizing?: boolean
}>()

const emit = defineEmits<{
  resizePreview: [widths: LibraryFlatColumnWidths]
  resizeCommit: [widths: LibraryFlatColumnWidths, changedColumns: readonly LibraryFlatColumnId[]]
  resizeCancel: []
  resizeState: [active: boolean]
  openContextMenu: [event: MouseEvent, openReason: 'pointer' | 'keyboard']
}>()

const { t } = useI18n()
const headerElement = ref<HTMLElement | null>(null)

interface ResizeDrag {
  pointerId: number
  handleId: string
  leftColumn: LibraryFlatColumnId
  rightColumn: LibraryFlatColumnId
  startX: number
  startWidths: LibraryFlatColumnWidths
  nextWidths: LibraryFlatColumnWidths
  handleElement: HTMLElement
}

let resizeDrag: ResizeDrag | null = null

function parseHandleId(handleId: string): [LibraryFlatColumnId, LibraryFlatColumnId] | null {
  const [left, right] = handleId.split(':')
  if (
    !left ||
    !right ||
    !LIBRARY_FLAT_COLUMN_IDS.includes(left as LibraryFlatColumnId) ||
    !LIBRARY_FLAT_COLUMN_IDS.includes(right as LibraryFlatColumnId)
  ) {
    return null
  }
  return [left as LibraryFlatColumnId, right as LibraryFlatColumnId]
}

function findHandle(handleId: string): HTMLElement | null {
  return (
    Array.from(
      headerElement.value?.querySelectorAll<HTMLElement>('[data-column-resize-handle]') ?? [],
    ).find((element) => element.dataset.columnResizeHandle === handleId) ?? null
  )
}

function beginPointerResize(handleId: string, event: PointerEvent): void {
  const columns = parseHandleId(handleId)
  const handleElement = findHandle(handleId)
  if (!columns || !handleElement || event.button !== 0 || resizeDrag) return
  if (
    !props.layout.visibleColumnIds.includes(columns[0]) ||
    props.layout.visibleColumnIds[props.layout.visibleColumnIds.indexOf(columns[0]) + 1] !==
      columns[1]
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  const startWidths = { ...props.layout.widths }
  resizeDrag = {
    pointerId: event.pointerId,
    handleId,
    leftColumn: columns[0],
    rightColumn: columns[1],
    startX: event.clientX,
    startWidths,
    nextWidths: startWidths,
    handleElement,
  }
  try {
    handleElement.setPointerCapture(event.pointerId)
  } catch {
    // Global listeners below still finish or cancel a drag if capture is unavailable.
  }
  window.addEventListener('pointermove', onGlobalPointerMove, true)
  window.addEventListener('pointerup', onGlobalPointerUp, true)
  window.addEventListener('pointercancel', onGlobalPointerCancel, true)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('keydown', onWindowKeyDown, true)
  emit('resizeState', true)
}

function onGlobalPointerMove(event: PointerEvent): void {
  const drag = resizeDrag
  if (!drag || event.pointerId !== drag.pointerId) return
  event.preventDefault()
  drag.nextWidths = resizeAdjacentLibraryColumns({
    widths: drag.startWidths,
    visibleColumnIds: props.layout.visibleColumnIds,
    leftColumn: drag.leftColumn,
    rightColumn: drag.rightColumn,
    delta: event.clientX - drag.startX,
  })
  emit('resizePreview', drag.nextWidths)
}

function removeDragListeners(): void {
  window.removeEventListener('pointermove', onGlobalPointerMove, true)
  window.removeEventListener('pointerup', onGlobalPointerUp, true)
  window.removeEventListener('pointercancel', onGlobalPointerCancel, true)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('keydown', onWindowKeyDown, true)
}

function finishPointerResize(commit: boolean): void {
  const drag = resizeDrag
  if (!drag) return
  resizeDrag = null
  removeDragListeners()
  try {
    if (drag.handleElement.hasPointerCapture(drag.pointerId)) {
      drag.handleElement.releasePointerCapture(drag.pointerId)
    }
  } catch {
    // Pointer capture can already be gone after pointercancel or navigation.
  }

  if (commit) {
    const changedColumns = [drag.leftColumn, drag.rightColumn].filter(
      (column) => drag.nextWidths[column] !== drag.startWidths[column],
    )
    if (changedColumns.length > 0) emit('resizeCommit', drag.nextWidths, changedColumns)
    else emit('resizeCancel')
  } else emit('resizeCancel')
  emit('resizeState', false)
}

function onGlobalPointerUp(event: PointerEvent): void {
  if (resizeDrag?.pointerId !== event.pointerId) return
  finishPointerResize(true)
}

function onGlobalPointerCancel(event: PointerEvent): void {
  if (resizeDrag?.pointerId !== event.pointerId) return
  finishPointerResize(false)
}

function onWindowBlur(): void {
  finishPointerResize(false)
}

function onPageHide(): void {
  finishPointerResize(false)
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (resizeDrag && event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    finishPointerResize(false)
  }
}

function onLostPointerCapture(event: PointerEvent): void {
  if (resizeDrag?.pointerId === event.pointerId) finishPointerResize(false)
}

function onHandleKeyDown(
  event: KeyboardEvent,
  leftColumn: LibraryFlatColumnId,
  rightColumn: LibraryFlatColumnId,
): void {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 16 : 8)
    const nextWidths = resizeAdjacentLibraryColumns({
      widths: props.layout.widths,
      visibleColumnIds: props.layout.visibleColumnIds,
      leftColumn,
      rightColumn,
      delta,
    })
    if (nextWidths[leftColumn] !== props.layout.widths[leftColumn]) {
      emit('resizeCommit', nextWidths, [leftColumn, rightColumn])
    }
    return
  }
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    event.preventDefault()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    emit(
      'openContextMenu',
      new MouseEvent('contextmenu', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
      'keyboard',
    )
  }
}

function onHeaderContextMenu(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  emit('openContextMenu', event, 'pointer')
}

function columnLabel(column: LibraryFlatColumnId): string {
  const key = column === 'play-count' ? 'playCount' : column
  return String(t(`library.columns.${key}`))
}

function handleLabel(left: LibraryFlatColumnId, right: LibraryFlatColumnId): string {
  return String(
    t('library.columns.resizeBetween', { left: columnLabel(left), right: columnLabel(right) }),
  )
}

function handleValueMax(left: LibraryFlatColumnId, right: LibraryFlatColumnId): number {
  const pair = props.layout.widths[left] + props.layout.widths[right]
  return Math.min(
    LIBRARY_FLAT_COLUMN_MAX_WIDTHS[left],
    pair - LIBRARY_FLAT_COLUMN_MIN_WIDTHS[right],
  )
}

onBeforeUnmount(() => {
  finishPointerResize(false)
})

defineExpose({
  beginPointerResize,
  getResizeHandles: () =>
    Array.from(
      headerElement.value?.querySelectorAll<HTMLElement>('[data-column-resize-handle]') ?? [],
    ),
})
</script>

<template>
  <div
    ref="headerElement"
    class="library-flat-track-header library-flat-track-grid auralis-type-caption"
    :class="{ 'library-flat-track-header--resizing': resizing }"
    @contextmenu="onHeaderContextMenu"
  >
    <div
      v-for="(column, index) in layout.visibleColumnIds"
      :key="column"
      class="library-flat-track-header-cell"
      :class="[
        `library-flat-column--${column}`,
        {
          'library-flat-column--align-right': ['album', 'play-count', 'duration'].includes(column),
        },
      ]"
      :aria-label="columnLabel(column)"
    >
      <span class="library-flat-column-label">{{ columnLabel(column) }}</span>
      <button
        v-if="index < layout.visibleColumnIds.length - 1"
        type="button"
        class="library-flat-column-resize-handle"
        role="separator"
        aria-orientation="vertical"
        :data-column-resize-handle="`${column}:${layout.visibleColumnIds[index + 1]}`"
        :aria-label="handleLabel(column, layout.visibleColumnIds[index + 1])"
        :aria-valuemin="LIBRARY_FLAT_COLUMN_MIN_WIDTHS[column]"
        :aria-valuemax="handleValueMax(column, layout.visibleColumnIds[index + 1])"
        :aria-valuenow="layout.widths[column]"
        tabindex="0"
        @lostpointercapture="onLostPointerCapture"
        @keydown="onHandleKeyDown($event, column, layout.visibleColumnIds[index + 1])"
      ></button>
    </div>
  </div>
</template>
