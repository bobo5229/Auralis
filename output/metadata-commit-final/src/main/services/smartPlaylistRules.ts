import type {
  SmartPlaylistExpression,
  SmartPlaylistExpressionRule,
  SmartPlaylistPredicateOperator,
  SmartPlaylistQueryField,
  SmartPlaylistRule,
  SmartPlaylistRuleCondition,
  SmartPlaylistRuleField,
} from '@shared/types/smartPlaylist'
import { assertRecentAddedDays } from '@shared/smartPlaylists/recentAdded'
import {
  assertRecentFrequentDays,
  isRecentFrequentRule,
} from '@shared/smartPlaylists/recentFrequent'
import { normalizeDelimitedValue } from '@shared/utils/delimitedValues'

const LEGACY_RULE_FIELDS = new Set<SmartPlaylistRuleField>(['genre', 'albumArtist'])
const QUERY_FIELDS = new Set<SmartPlaylistQueryField>(['genre', 'artist', 'albumArtist', 'added'])
const PREDICATE_OPERATORS = new Set<SmartPlaylistPredicateOperator>([
  'has',
  'isEmpty',
  'addedBefore',
  'addedWithin',
])

function normalizeCondition(condition: SmartPlaylistRuleCondition): SmartPlaylistRuleCondition {
  return {
    field: condition.field,
    value: condition.value === null ? null : condition.value.trim(),
  }
}

/**
 * Reject empty / garbage rules that would match the entire library or fail silently.
 * Used by create / createFromQuery paths.
 */
export function assertValidSmartPlaylistRule(rule: SmartPlaylistRule): void {
  if (!rule || typeof rule !== 'object') {
    throw new Error('无效的智能歌单规则')
  }

  if ('preset' in rule) {
    if (rule.preset === 'mostListened') {
      if (Object.keys(rule).some((key) => key !== 'preset')) {
        throw new Error('无效的智能歌单预设')
      }
      return
    }
    if (
      (rule.preset !== 'recentPlayed' &&
        rule.preset !== 'recentAdded' &&
        !isRecentFrequentRule(rule)) ||
      Object.keys(rule).some((key) => key !== 'preset' && key !== 'days')
    ) {
      throw new Error('无效的智能歌单预设')
    }
    if (rule.preset === 'recentAdded') assertRecentAddedDays(rule.days)
    else assertRecentFrequentDays(rule.days)
    return
  }

  if (isExpressionRule(rule)) {
    assertValidExpression(rule.expression)
    return
  }

  if (!('conditions' in rule) || !Array.isArray(rule.conditions)) {
    throw new Error('无效的智能歌单规则')
  }

  if (rule.conditions.length === 0) {
    throw new Error('智能歌单规则不能为空')
  }

  for (const condition of rule.conditions) {
    if (!condition || typeof condition !== 'object') {
      throw new Error('无效的智能歌单条件')
    }
    if (!LEGACY_RULE_FIELDS.has(condition.field as SmartPlaylistRuleField)) {
      throw new Error(`不支持的规则字段: ${String(condition.field)}`)
    }
    if (condition.value !== null && typeof condition.value !== 'string') {
      throw new Error('规则值必须是字符串或 null')
    }
    if (typeof condition.value === 'string' && condition.value.trim().length === 0) {
      throw new Error('规则值不能为空字符串')
    }
  }
}

function assertValidExpression(expression: SmartPlaylistExpression): void {
  if (!expression || typeof expression !== 'object' || !('type' in expression)) {
    throw new Error('无效的智能歌单表达式')
  }

  if (expression.type === 'predicate') {
    if (!QUERY_FIELDS.has(expression.field as SmartPlaylistQueryField)) {
      throw new Error(`不支持的查询字段: ${String(expression.field)}`)
    }
    if (!PREDICATE_OPERATORS.has(expression.operator as SmartPlaylistPredicateOperator)) {
      throw new Error(`不支持的操作符: ${String(expression.operator)}`)
    }

    const field = expression.field
    const operator = expression.operator

    if (field === 'added') {
      if (operator !== 'addedBefore' && operator !== 'addedWithin') {
        throw new Error('ADDED 字段只能使用 BEFORE 或 WITHIN')
      }
      if (typeof expression.value !== 'string' || expression.value.trim().length === 0) {
        throw new Error('ADDED 规则需要时间值')
      }
      return
    }

    if (operator === 'isEmpty') {
      return
    }

    if (operator === 'has') {
      if (typeof expression.value !== 'string' || expression.value.trim().length === 0) {
        throw new Error('HAS 规则需要非空查询值')
      }
      return
    }

    throw new Error(`${field} 字段不支持操作符 ${operator}`)
  }

  if (expression.type === 'and' || expression.type === 'or') {
    if (!Array.isArray(expression.operands) || expression.operands.length === 0) {
      throw new Error(expression.type === 'and' ? 'AND 规则不能为空' : 'OR 规则不能为空')
    }

    for (const operand of expression.operands) {
      assertValidExpression(operand)
    }
    return
  }

  throw new Error(`不支持的表达式类型: ${String((expression as { type: unknown }).type)}`)
}

export function isExpressionRule(rule: SmartPlaylistRule): rule is SmartPlaylistExpressionRule {
  return 'expression' in rule
}

function normalizeRelativeDuration(value: string, operator: 'addedBefore' | 'addedWithin'): string {
  const normalized = value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  const match = normalized.match(
    /^([1-9]\d*) (day|days|week|weeks|month|months|year|years)( ago)?$/,
  )

  if (!match) {
    throw new Error(
      operator === 'addedBefore'
        ? 'ADDED BEFORE 需要类似 "30 days ago"、"2 weeks ago" 的时间'
        : 'ADDED WITHIN 需要类似 "30 days"、"2 weeks" 的时间',
    )
  }

  const [, amount, unit, ago] = match
  if (operator === 'addedBefore' && !ago) {
    throw new Error('ADDED BEFORE 的时间需要以 ago 结尾，例如 "30 days ago"')
  }

  const normalizedUnit = unit.endsWith('s') ? unit : `${unit}s`
  return operator === 'addedBefore'
    ? `${amount} ${normalizedUnit} ago`
    : `${amount} ${normalizedUnit}`
}

function normalizeExpression(expression: SmartPlaylistExpression): SmartPlaylistExpression {
  if (expression.type === 'predicate') {
    if (expression.operator === 'addedBefore' || expression.operator === 'addedWithin') {
      return {
        ...expression,
        value: normalizeRelativeDuration(expression.value ?? '', expression.operator),
      }
    }

    return {
      ...expression,
      value: expression.value?.trim(),
    }
  }

  return {
    type: expression.type,
    operands: expression.operands.map(normalizeExpression),
  }
}

export function normalizeRule(rule: SmartPlaylistRule): SmartPlaylistRule {
  if ('preset' in rule) {
    return rule.preset === 'mostListened'
      ? { preset: 'mostListened' }
      : { preset: rule.preset, days: rule.days }
  }
  if (isExpressionRule(rule)) {
    return { expression: normalizeExpression(rule.expression) }
  }

  const fieldOrder = { genre: 0, albumArtist: 1 } as const
  return {
    conditions: rule.conditions
      .map(normalizeCondition)
      .sort((left, right) => fieldOrder[left.field] - fieldOrder[right.field]),
  }
}

export function canonicalRule(rule: SmartPlaylistRule): string {
  if ('preset' in rule) return JSON.stringify(normalizeRule(rule))
  if (isExpressionRule(rule)) {
    const canonicalizeExpression = (expression: SmartPlaylistExpression): unknown => {
      if (expression.type === 'predicate') {
        return {
          type: expression.type,
          field: expression.field,
          operator: expression.operator,
          value:
            expression.value === undefined ? undefined : normalizeDelimitedValue(expression.value),
        }
      }

      const operands = expression.operands
        .map(canonicalizeExpression)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      return { type: expression.type, operands }
    }

    return JSON.stringify(canonicalizeExpression(normalizeExpression(rule.expression)))
  }

  return JSON.stringify({
    conditions: rule.conditions.map((condition) => ({
      field: condition.field,
      value: condition.value === null ? null : normalizeDelimitedValue(condition.value),
    })),
  })
}
