import { displacementMap } from './displacementMap'

// Adapted from WXperia/liquid-glass-vue 1.0.9 GlassFilter (rdev, MIT).
// Standard mode only; neither a Worker nor a render loop is needed for optics.
export function glassFilterMarkup(id: string): string {
  const channels = ['RED', 'GREEN', 'BLUE'].map((channel, index) => {
    const matrix = Array.from({ length: 20 }, (_, i) =>
      i === index * 6 || i === 18 ? 1 : 0,
    ).join(' ')
    return `<feDisplacementMap in="SourceGraphic" in2="MAP" scale="${-64 * (1 + index * 0.1)}" xChannelSelector="R" yChannelSelector="B" result="${channel}_D"/><feColorMatrix in="${channel}_D" type="matrix" values="${matrix}" result="${channel}"/>`
  }).join('')
  return `<defs><filter id="${id}" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB"><feImage href="${displacementMap}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" result="MAP"/><feColorMatrix in="MAP" type="matrix" values="0.3 0.3 0.3 0 0 0.3 0.3 0.3 0 0 0.3 0.3 0.3 0 0 0 0 0 1 0" result="INTENSITY"/><feComponentTransfer in="INTENSITY" result="MASK"><feFuncA type="discrete" tableValues="0 0.1 1"/></feComponentTransfer>${channels}<feBlend in="GREEN" in2="BLUE" mode="screen" result="GB"/><feBlend in="RED" in2="GB" mode="screen" result="RGB"/><feGaussianBlur in="RGB" stdDeviation="0.3" result="SOFT"/><feComposite in="SOFT" in2="MASK" operator="in" result="EDGE"/><feComponentTransfer in="MASK" result="INVERSE"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feComposite in="SourceGraphic" in2="INVERSE" operator="in" result="CENTER"/><feComposite in="EDGE" in2="CENTER" operator="over"/></filter></defs>`
}
