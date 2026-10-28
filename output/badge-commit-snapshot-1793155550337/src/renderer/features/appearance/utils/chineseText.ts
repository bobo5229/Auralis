import { ConverterFactory } from 'opencc-js/core'
import fromChinese from 'opencc-js/from/cn'
import fromTaiwan from 'opencc-js/from/tw'
import toChinese from 'opencc-js/to/cn'
import toTaiwan from 'opencc-js/to/tw'

export type ChineseScript = 'simplified' | 'traditional'

const converters = {
  simplified: ConverterFactory(fromTaiwan, toChinese),
  traditional: ConverterFactory(fromChinese, toTaiwan),
}
const caches = {
  simplified: new Map<string, string>(),
  traditional: new Map<string, string>(),
}
const CACHE_LIMIT = 2048
const MAX_CACHED_LENGTH = 256

/** Converts original display text only; search normalization remains independent. */
export function convertChineseText(
  value: string | null | undefined,
  script: ChineseScript,
): string {
  if (!value) return value ?? ''
  const cache = caches[script]
  const cached = cache.get(value)
  if (cached !== undefined) return cached
  const converted = converters[script](value)
  if (value.length <= MAX_CACHED_LENGTH) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
    cache.set(value, converted)
  }
  return converted
}

export function isChineseScript(value: unknown): value is ChineseScript {
  return value === 'simplified' || value === 'traditional'
}
