import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { AnnualSummary } from '@shared/types/listeningArchive'
import type { PlaybackTrackDto } from '@shared/types/playback'
import type { AuralisApi } from '@shared/ipc/api'
import type { PlaybackPublicApi } from '@renderer/features/playback/composables/usePlayback'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export function useAnnualSummaryActions(
  summary: MaybeRefOrGetter<AnnualSummary | null>,
  playlists: AuralisApi['playlists'],
  playback: Pick<PlaybackPublicApi, 'playTrackFromQueue'>,
  playlistName: (year: number) => string,
) {
  const saving = ref(false)
  const playing = ref(false)
  const actionError = ref<'play' | 'save' | null>(null)
  const saved = ref(new Map<number, number>())
  const drafts = new Map<number, number>()
  const unavailableCount = ref(0)
  const savedPlaylistId = computed(() => saved.value.get(toValue(summary)?.year ?? 0) ?? null)
  let disposed = false
  watch(
    () => toValue(summary)?.year,
    () => {
      actionError.value = null
      unavailableCount.value = 0
    },
  )
  onScopeDispose(() => {
    disposed = true
  })

  async function play(tracks: PlaybackTrackDto[]) {
    if (!tracks.length || playing.value) return
    playing.value = true
    actionError.value = null
    try {
      await playback.playTrackFromQueue(tracks, tracks[0].id, { shufflePool: tracks })
    } catch (cause) {
      if (!disposed) actionError.value = 'play'
      rendererDiagnostics.warn({
        scope: 'archive.annual-play',
        message: 'Could not play annual selection',
        cause,
      })
    } finally {
      if (!disposed) playing.value = false
    }
  }

  async function save() {
    const current = toValue(summary)
    if (!current?.selection.length || saving.value || saved.value.has(current.year)) return
    saving.value = true
    actionError.value = null
    unavailableCount.value = 0
    try {
      let id = drafts.get(current.year)
      if (!id) {
        id = (await playlists.create()).id
        drafts.set(current.year, id)
      }
      // Keep the created draft on a failed request so Retry cannot create duplicates.
      if (!(await playlists.rename(id, playlistName(current.year)))) {
        drafts.delete(current.year)
        throw new Error('Playlist is no longer available')
      }
      const result = await playlists.addTracks(
        id,
        current.selection.map((track) => track.id),
      )
      if (!result.playlistExists) {
        drafts.delete(current.year)
        throw new Error('Playlist is no longer available')
      }
      if (!disposed) {
        saved.value = new Map(saved.value).set(current.year, id)
        if (toValue(summary)?.year === current.year)
          unavailableCount.value = result.unavailableCount
      }
    } catch (cause) {
      if (!disposed && toValue(summary)?.year === current.year) actionError.value = 'save'
      rendererDiagnostics.warn({
        scope: 'archive.annual-save',
        message: 'Could not save annual selection',
        cause,
      })
    } finally {
      if (!disposed) saving.value = false
    }
  }
  return { saving, playing, actionError, unavailableCount, savedPlaylistId, play, save }
}
