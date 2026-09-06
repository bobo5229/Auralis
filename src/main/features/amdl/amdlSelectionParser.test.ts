import { describe, it, expect } from 'vitest'
import { AmdlSelectionParser } from './amdlSelectionParser'

// Real AMDL 33-track album output fixture for Jacky Cheung (张学友) Classic Tour Hong Kong
const JACKY_CHEUNG_ALBUM_SAMPLE = [
  'Queue 1 of 1: Album',
  'Storefront: cn',
  '+--------------+--------------------------------------------------------+-------------------+-------+',
  '| TRACK NUMBER |                       TRACK NAME                       | EXPLICIT/CLEAN/NO | TYPE  |',
  '+--------------+--------------------------------------------------------+-------------------+-------+',
  '| 1            | 01. 我与你 (Live)                                      | None              | SONG  |',
  '| 2            | 02. 非常夏日 (Live)                                    | None              | SONG  |',
  '| 3            | 03. 今晚要尽情 (Live)                                  | None              | SONG  |',
  '| 4            | 04. 慢慢 (Live)                                        | None              | SONG  |',
  '| 5            | 05. 离人 (Live)                                        | None              | SONG  |',
  '| 6            | 06. 这么近(那么远) [Live]                              | None              | SONG  |',
  '| 7            | 07. 怎么舍得你 (Live)                                  | None              | SONG  |',
  '| 8            | 08. 爱·火·花 (Live)                                    | None              | SONG  |',
  '| 9            | 09. 忘记他 (Live)                                      | None              | SONG  |',
  '| 10           | 10. 头发乱了 (Live)                                    | None              | SONG  |',
  '| 11           | 01. 和好不如初 (Live)                                  | None              | SONG  |',
  '| 12           | 02. 时间有泪 (Live)                                    | None              | SONG  |',
  '| 13           | 03. 寂寞的男人 (Live)                                  | None              | SONG  |',
  '| 14           | 03. Drums, Percussion & Horn                           | None              | SONG  |',
  '|              | Solo (Live)                                            |                   |       |',
  '| 15           | 04. 野猫之恋 (Live)                                    | None              | SONG  |',
  '| 16           | 05. 饿狼传说 (Live)                                    | None              | SONG  |',
  '| 17           | 06. 如果这都不算爱 (Live)                              | None              | SONG  |',
  '| 18           | 07. 我醒着做梦 (Live)                                  | None              | SONG  |',
  '| 19           | 08. 不后悔 (Live)                                      | None              | SONG  |',
  '| 20           | 09. 初吻 (Live)                                        | None              | SONG  |',
  '| 21           | 01. 醒着做梦 (Live)                                    | None              | SONG  |',
  '| 22           | 02. 一千个伤心的理由 (Live)                            | None              | SONG  |',
  '| 23           | 03. 吻别 (Live)                                        | None              | SONG  |',
  '| 24           | 04. 每天爱你多一些 (Live)                              | None              | SONG  |',
  '| 25           | 05. 李香兰 (Live)                                      | None              | SONG  |',
  '| 26           | 06. 情已逝 (Live)                                      | None              | SONG  |',
  '| 27           | 07. 想和你去吹吹风 (Live)                              | None              | SONG  |',
  '| 28           | 08. 一路上有你 (Live)                                  | None              | SONG  |',
  '| 29           | 01. 心如刀割 (Live)                                    | None              | SONG  |',
  '| 30           | 02. 她来听我的演唱会 (Live)                            | None              | SONG  |',
  '| 31           | 03. 爱是永恒 (Live)                                    | None              | SONG  |',
  '| 32           | 04. Medley (友情歌 2014-1985)                          | None              | SONG  |',
  '|              | [Live]                                                 |                   |       |',
  '| 33           | 05. 如果·爱 (Live)                                     | None              | SONG  |',
  '+--------------+--------------------------------------------------------+-------------------+-------+',
  'Please select from the track options above',
]

describe('AmdlSelectionParser', () => {
  it('parses the real 33-track album sample accurately', () => {
    const parser = new AmdlSelectionParser()

    for (const line of JACKY_CHEUNG_ALBUM_SAMPLE) {
      parser.feedLine(line)
    }

    const tracks = parser.getTracks()

    // 1. exactly 33 tracks
    expect(tracks).toHaveLength(33)

    // 2. index 1..33 correct
    for (let i = 0; i < 33; i++) {
      expect(tracks[i].index).toBe(i + 1)
      expect(tracks[i].type).toBe('SONG')
    }

    // 3. track 14 continuation correct
    expect(tracks[13]).toEqual({
      index: 14,
      title: '03. Drums, Percussion & Horn Solo (Live)',
      type: 'SONG',
    })

    // 4. track 32 continuation correct
    expect(tracks[31]).toEqual({
      index: 32,
      title: '04. Medley (友情歌 2014-1985) [Live]',
      type: 'SONG',
    })

    // 5. handshake correctly recognized
    expect(parser.isSelectionRequested()).toBe(true)
  })

  it('ignores headers, separators, storefront and regular logs', () => {
    const parser = new AmdlSelectionParser()
    const nonTrackLines = [
      '',
      'Queue 1 of 1: Album',
      'Storefront: cn',
      '+--------------+--------------------------------------------------------+-------------------+-------+',
      '| TRACK NUMBER |                       TRACK NAME                       | EXPLICIT/CLEAN/NO | TYPE  |',
      '+--------------+--------------------------------------------------------+-------------------+-------+',
      'Some ordinary info log message',
      'Downloading manifest...',
      'Decrypted audio segment',
    ]

    for (const line of nonTrackLines) {
      const res = parser.feedLine(line)
      expect(res.tracks).toHaveLength(0)
      expect(res.selectionRequested).toBe(false)
    }

    expect(parser.getTracks()).toHaveLength(0)
    expect(parser.isSelectionRequested()).toBe(false)
  })

  it('detects handshake prompt line and returns selectionRequested in result', () => {
    const parser = new AmdlSelectionParser()
    parser.feedLine('| 1 | Test Track | None | SONG |')
    expect(parser.isSelectionRequested()).toBe(false)

    const res = parser.feedLine('Please select from the track options above')
    expect(res.selectionRequested).toBe(true)
    expect(parser.isSelectionRequested()).toBe(true)
    expect(res.tracks).toHaveLength(1)
  })

  it('resets tracks and handshake on reset()', () => {
    const parser = new AmdlSelectionParser()
    parser.feedLine('| 1 | Test Track | None | SONG |')
    parser.feedLine('Please select from the track options above')
    expect(parser.getTracks()).toHaveLength(1)
    expect(parser.isSelectionRequested()).toBe(true)

    parser.reset()
    expect(parser.getTracks()).toHaveLength(0)
    expect(parser.isSelectionRequested()).toBe(false)
  })
})
