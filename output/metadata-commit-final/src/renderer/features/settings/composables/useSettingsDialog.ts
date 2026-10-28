import { readonly, ref } from 'vue'
import { DEFAULT_SETTINGS_SECTION, type SettingsSection } from '../utils/settingsSections'

const isSettingsOpen = ref(false)
const selectedSection = ref<SettingsSection>(DEFAULT_SETTINGS_SECTION)
let openingTrigger: HTMLElement | null = null

function openSettings(section?: SettingsSection): void {
  if (section) selectedSection.value = section
  if (isSettingsOpen.value) return
  openingTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  isSettingsOpen.value = true
}

function closeSettings(): void {
  isSettingsOpen.value = false
}

function selectSettingsSection(section: SettingsSection): void {
  selectedSection.value = section
}

function restoreSettingsFocus(): void {
  const candidates = [
    openingTrigger,
    document.querySelector<HTMLElement>('[data-settings-trigger]'),
  ]
  openingTrigger = null
  const target = candidates.find(
    (element) =>
      element?.isConnected &&
      element !== document.body &&
      !element.matches(':disabled') &&
      !element.closest('[inert]'),
  )
  target?.focus({ preventScroll: true })
}

/** One dialog and one in-memory section selection across all settings entry points. */
export function useSettingsDialog() {
  return {
    isSettingsOpen: readonly(isSettingsOpen),
    selectedSection: readonly(selectedSection),
    openSettings,
    closeSettings,
    selectSettingsSection,
    restoreSettingsFocus,
  }
}
