import { describe, expect, it, vi } from 'vitest'
import { ShellTestElement, ShellTestRect } from '@renderer/testUtils/rendererTestHost'
import { createAlbumIndexLayoutTransition } from './albumIndexLayoutTransition'

function setup() {
  const node = new ShellTestElement('nav')
  node.style.setProperty('position', 'absolute')
  node.style.setProperty('right', '2px')
  const rect = vi.spyOn(node, 'getBoundingClientRect')
  rect.mockReturnValue(new ShellTestRect(1400, 10, 24, 500))
  const transition = createAlbumIndexLayoutTransition(() => node as unknown as HTMLElement)
  return { node, rect, transition }
}

describe('album letter index layout transition', () => {
  it('holds the old position across the layout commit and starts only when requested', () => {
    const { node, rect, transition } = setup()
    transition.prepare()
    expect(node.style.position).toBe('fixed')
    expect(node.style.left).toBe('1400px')
    rect.mockReturnValue(new ShellTestRect(1115, 10, 24, 500))
    transition.commit()
    expect(node.style.left).toBe('1115px')
    expect(node.style.transform).toBe('translate3d(285px, 0px, 0)')
    expect(node.animations).toHaveLength(0)
    transition.animate(500)
    expect(node.animations[0].keyframes).toEqual([
      { transform: 'translate3d(285px, 0px, 0)' },
      { transform: 'translate3d(0, 0, 0)' },
    ])
    expect(node.animations[0].options).toMatchObject({ duration: 500 })
    transition.clear()
    expect(node.animations[0].cancelled).toBe(true)
    expect(node.style.position).toBe('absolute')
    expect(node.style.getPropertyValue('right')).toBe('2px')
    expect(node.style.getPropertyValue('left')).toBe('')
    expect(node.style.getPropertyValue('transform')).toBe('')
  })

  it('reverses from the painted position and restores original styles after cancellation', () => {
    const { node, rect, transition } = setup()
    transition.prepare()
    rect.mockReturnValue(new ShellTestRect(1115, 10, 24, 500))
    transition.commit()
    transition.animate(500)
    rect.mockReturnValue(new ShellTestRect(1250, 10, 24, 500))
    transition.prepare()
    expect(node.animations[0].cancelled).toBe(true)
    expect(node.style.left).toBe('1250px')
    rect.mockReturnValue(new ShellTestRect(1400, 10, 24, 500))
    transition.commit()
    expect(node.style.transform).toBe('translate3d(-150px, 0px, 0)')
    transition.clear()
    transition.clear()
    expect(node.style.position).toBe('absolute')
    expect(node.style.getPropertyValue('right')).toBe('2px')
    expect(node.style.getPropertyValue('left')).toBe('')
  })
})
