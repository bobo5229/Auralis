import { afterEach, describe, expect, it, vi } from 'vitest'
import { animateAlbumGridReflow, freezeAlbumGridSnapshot } from './albumGridReflowMotion'

function element(left: number, top: number, width: number, key = '') {
  const children = new Map<string, HTMLElement>()
  const finishers: Array<() => void> = []
  const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = []
  const items: HTMLElement[] = []
  const node = {
    dataset: { albumKey: key },
    style: { opacity: '1', transform: 'none', clipPath: '' },
    children: items,
    getBoundingClientRect: () => ({ left, top, width, height: width }),
    querySelector: (selector: string) => children.get(selector),
    querySelectorAll: () => Array.from(children.values()),
    animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
      calls.push({ frames, options })
      let resolve: () => void = () => {},
        reject: () => void = () => {}
      const finished = new Promise<void>((yes, no) => {
        resolve = yes
        reject = () => no(new Error('Cancelled'))
      })
      finishers.push(resolve)
      return { finished, cancel: reject }
    },
  } as unknown as HTMLElement
  return { node, calls, finishers, children, items }
}

afterEach(() => vi.unstubAllGlobals())

describe('album grid reflow motion', () => {
  it('matches identities despite changed order, scales only artwork and waits for all 500ms animations', async () => {
    vi.stubGlobal('getComputedStyle', (node: HTMLElement) => node.style)
    const source = element(10, 20, 100, 'same')
    const sourceCover = element(10, 20, 100)
    const sourceMeta = element(10, 132, 100)
    source.children.set('.album-card-cover', sourceCover.node)
    source.children.set('.album-card-meta', sourceMeta.node)
    const old = element(120, 20, 100, 'old')
    const target = element(210, 200, 160, 'same')
    const targetCover = element(210, 200, 160)
    const targetMeta = element(210, 372, 160)
    target.children.set('.album-card-cover', targetCover.node)
    target.children.set('.album-card-meta', targetMeta.node)
    const added = element(400, 200, 160, 'new')
    const fromGroup = element(0, 0, 500)
    const toGroup = element(0, 0, 500)
    fromGroup.items.push(source.node, old.node)
    toGroup.items.push(added.node, target.node)
    const animations: Animation[] = []
    let done = false
    const result = animateAlbumGridReflow(
      new Map([
        ['from', fromGroup.node],
        ['to', toGroup.node],
      ]),
      animations,
    ).then(() => {
      done = true
    })
    expect(source.node.style.opacity).toBe('0')
    expect(target.calls[0].frames).toEqual([
      { transform: 'translate3d(-200px,-180px,0)' },
      { transform: 'none' },
    ])
    expect(targetCover.calls[0].frames[0].transform).toBe('translate(0px,0px) scale(0.625)')
    expect(targetMeta.calls[0].frames[0].transform).toBe('translate(0px,-60px)')
    expect(added.calls[0].frames[0].opacity).toBe(0)
    expect(old.calls[0].frames[1].opacity).toBe(0)
    const all = [source, old, target, targetCover, targetMeta, added].flatMap((e) => e.calls)
    expect(all).toHaveLength(5)
    expect(all.every((call) => call.options.duration === 500)).toBe(true)
    expect(
      all
        .flatMap((call) => call.frames)
        .every((frame) => !('width' in frame) && !('height' in frame)),
    ).toBe(true)
    expect(done).toBe(false)
    for (const e of [old, target, targetCover, targetMeta, added]) e.finishers.forEach((f) => f())
    await result
    expect(done).toBe(true)
  })

  it('settles cancelled animations and handles an empty or incomplete viewport safely', async () => {
    vi.stubGlobal('getComputedStyle', (node: HTMLElement) => node.style)
    await animateAlbumGridReflow(new Map(), [])
    const target = element(0, 0, 100, 'new')
    const group = element(0, 0, 200)
    group.items.push(target.node)
    const animations: Animation[] = []
    const result = animateAlbumGridReflow(new Map([['to', group.node]]), animations)
    animations.forEach((a) => a.cancel())
    await expect(result).resolves.toBeUndefined()
  })

  it('freezes the current child transforms before a reversed snapshot is moved', () => {
    const card = element(0, 0, 160)
    const cover = element(0, 0, 160)
    const meta = element(0, 172, 160)
    card.children.set('.album-card-cover', cover.node)
    card.children.set('.album-card-meta', meta.node)
    vi.stubGlobal('getComputedStyle', (node: HTMLElement) => ({
      transform:
        node === cover.node ? 'matrix(0.8, 0, 0, 0.8, 0, 0)' : 'matrix(1, 0, 0, 1, 0, -32)',
    }))
    freezeAlbumGridSnapshot(card.node)
    expect(cover.node.style.transform).toBe('matrix(0.8, 0, 0, 0.8, 0, 0)')
    expect(meta.node.style.transform).toBe('matrix(1, 0, 0, 1, 0, -32)')
  })
})
