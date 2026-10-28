import { computed, ref, watch } from 'vue'

// A creation template follows the UI language until the user edits the input.
export function useDefaultPlaylistName(getTemplate: () => string) {
  const template = computed(getTemplate)
  const name = ref(template.value)
  const nameEdited = ref(false)
  watch(template, (value) => {
    if (!nameEdited.value) name.value = value
  })
  function reset(): void {
    nameEdited.value = false
    name.value = template.value
  }
  return { name, nameEdited, reset }
}
