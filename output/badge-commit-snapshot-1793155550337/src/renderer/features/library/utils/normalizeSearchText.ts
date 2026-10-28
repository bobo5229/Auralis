import { CustomConverter } from 'opencc-js/core'
import characters from 'opencc-js/dict/TSCharacters'

// Phrase conversion can change a full title and its typed prefix differently.
// Keep search keys context-free and apply this once to each original value.
const toSimplified = CustomConverter(characters)

export function normalizeSearchText(value: string | null | undefined): string {
  return toSimplified((value ?? '').normalize('NFKC'))
    .trim()
    .toLocaleLowerCase()
}
