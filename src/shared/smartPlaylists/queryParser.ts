import type {
  SmartPlaylistExpression,
  SmartPlaylistPredicate,
  SmartPlaylistQueryField,
} from '../types/smartPlaylist'

type TokenType =
  | 'field'
  | 'has'
  | 'is'
  | 'empty'
  | 'and'
  | 'or'
  | 'leftParen'
  | 'rightParen'
  | 'value'
  | 'end'

interface Token {
  type: TokenType
  value?: string
  field?: SmartPlaylistQueryField
  position: number
}

export class SmartPlaylistQueryError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message)
    this.name = 'SmartPlaylistQueryError'
  }
}

function isWordBoundary(character: string | undefined): boolean {
  return character === undefined || /\s|\(|\)/.test(character)
}

function tokenize(query: string): Token[] {
  const tokens: Token[] = []
  let position = 0

  while (position < query.length) {
    if (/\s/.test(query[position])) {
      position += 1
      continue
    }

    if (query[position] === '(') {
      tokens.push({ type: 'leftParen', position })
      position += 1
      continue
    }

    if (query[position] === ')') {
      tokens.push({ type: 'rightParen', position })
      position += 1
      continue
    }

    if (query[position] === '"') {
      const start = position
      position += 1
      let value = ''
      let closed = false

      while (position < query.length) {
        const character = query[position]
        if (character === '\\' && query[position + 1] === '"') {
          value += '"'
          position += 2
          continue
        }
        if (character === '"') {
          closed = true
          position += 1
          break
        }
        value += character
        position += 1
      }

      if (!closed) throw new SmartPlaylistQueryError('缺少英文右双引号', start)
      if (!value.trim()) throw new SmartPlaylistQueryError('查询值不能为空', start)
      tokens.push({ type: 'value', value, position: start })
      continue
    }

    const remaining = query.slice(position)
    const upperRemaining = remaining.toUpperCase()
    const candidates: Array<{
      text: string
      type: TokenType
      field?: SmartPlaylistQueryField
    }> = [
      { text: 'ALBUM ARTIST', type: 'field', field: 'albumArtist' },
      { text: 'ARTIST', type: 'field', field: 'artist' },
      { text: 'GENRE', type: 'field', field: 'genre' },
      { text: 'EMPTY', type: 'empty' },
      { text: 'HAS', type: 'has' },
      { text: 'AND', type: 'and' },
      { text: 'OR', type: 'or' },
      { text: 'IS', type: 'is' },
    ]
    const match = candidates.find(
      (candidate) =>
        upperRemaining.startsWith(candidate.text) &&
        isWordBoundary(remaining[candidate.text.length]),
    )

    if (!match) {
      throw new SmartPlaylistQueryError('无法识别的语法，请检查字段、操作符和英文双引号', position)
    }

    tokens.push({
      type: match.type,
      field: match.field,
      position,
    })
    position += match.text.length
  }

  tokens.push({ type: 'end', position: query.length })
  return tokens
}

class Parser {
  private index = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): SmartPlaylistExpression {
    if (this.peek().type === 'end') {
      throw new SmartPlaylistQueryError('请输入查询语法', 0)
    }

    const expression = this.parseOr()
    const trailing = this.peek()
    if (trailing.type !== 'end') {
      throw new SmartPlaylistQueryError('表达式后存在多余内容', trailing.position)
    }
    return expression
  }

  private parseOr(): SmartPlaylistExpression {
    const operands = [this.parseAnd()]

    while (this.peek().type === 'or') {
      this.consume('or')
      operands.push(this.parseAnd())
    }

    return operands.length === 1 ? operands[0] : { type: 'or', operands }
  }

  private parseAnd(): SmartPlaylistExpression {
    const operands = [this.parsePrimary()]

    while (this.peek().type === 'and') {
      this.consume('and')
      operands.push(this.parsePrimary())
    }

    return operands.length === 1 ? operands[0] : { type: 'and', operands }
  }

  private parsePrimary(): SmartPlaylistExpression {
    if (this.peek().type === 'leftParen') {
      this.consume('leftParen')
      const expression = this.parseOr()
      this.consume('rightParen', '缺少右括号')
      return expression
    }

    return this.parsePredicate()
  }

  private parsePredicate(): SmartPlaylistExpression {
    const fieldToken = this.consume('field', '此处需要 GENRE、ARTIST 或 ALBUM ARTIST')
    const field = fieldToken.field!

    if (this.peek().type === 'is') {
      this.consume('is')
      this.consume('empty', 'IS 后只能使用 EMPTY')
      return { type: 'predicate', field, operator: 'isEmpty' }
    }

    this.consume('has', '字段后需要 HAS 或 IS EMPTY')
    const firstValue = this.consume('value', 'HAS 后的查询值必须使用英文双引号')
    const predicates: SmartPlaylistPredicate[] = [
      { type: 'predicate', field, operator: 'has', value: firstValue.value! },
    ]

    while (this.peek().type === 'or' && this.tokens[this.index + 1]?.type === 'value') {
      this.consume('or')
      const value = this.consume('value')
      predicates.push({ type: 'predicate', field, operator: 'has', value: value.value! })
    }

    return predicates.length === 1 ? predicates[0] : { type: 'or', operands: predicates }
  }

  private peek(): Token {
    return this.tokens[this.index]
  }

  private consume(type: TokenType, message?: string): Token {
    const token = this.peek()
    if (token.type !== type) {
      throw new SmartPlaylistQueryError(message ?? `此处需要 ${type}`, token.position)
    }
    this.index += 1
    return token
  }
}

export function parseSmartPlaylistQuery(query: string): SmartPlaylistExpression {
  return new Parser(tokenize(query)).parse()
}
