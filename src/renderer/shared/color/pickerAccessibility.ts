import { tinycolor } from 'vue-color'

type Translate = (key: string, values?: Record<string, string | number>) => string

const inputLabelKeys: Record<string, string> = {
  hex: 'hexField',
  'hex with transparency': 'hexField',
  red: 'redField',
  green: 'greenField',
  blue: 'blueField',
  hue: 'hueField',
  saturation: 'saturationField',
  lightness: 'lightnessField',
  brightness: 'brightnessField',
}
export function syncPickerAccessibility(
  host: HTMLElement,
  pickerLabel: string,
  activeColor: string,
  t: Translate,
): void {
  host.querySelector<HTMLElement>('[role="application"]')?.setAttribute('aria-label', pickerLabel)
  host
    .querySelector<HTMLElement>('.vc-saturation-slider[role="application"]')
    ?.setAttribute('aria-label', t('colorPicker.saturationBrightnessSlider'))
  host
    .querySelector<HTMLElement>('.presets[role="listbox"]')
    ?.setAttribute('aria-label', t('colorPicker.presetListLabel'))

  host.querySelectorAll<HTMLElement>('.presets [role="option"]').forEach((option) => {
    const color = option.getAttribute('title')
    if (color) {
      option.setAttribute('aria-label', `${t('colorPicker.presetColor')} ${color.toUpperCase()}`)
    }
  })

  host.querySelectorAll<HTMLInputElement>('.vc-input-input').forEach((input) => {
    const originalLabel = input.getAttribute('aria-label')?.toLowerCase()
    const key =
      input.getAttribute('data-accent-label-key') ??
      (originalLabel ? inputLabelKeys[originalLabel] : undefined)
    if (key) {
      input.setAttribute('data-accent-label-key', key)
      input.setAttribute('aria-label', t(`colorPicker.${key}`))
    }
  })

  host.querySelectorAll<HTMLElement>('[role="slider"]').forEach((slider) => {
    const originalLabel = slider.getAttribute('aria-label')?.toLowerCase() ?? ''
    if (originalLabel.includes('saturation') && originalLabel.includes('brightness')) {
      slider.setAttribute('aria-label', t('colorPicker.saturationBrightnessSlider'))
      const valueText = slider.getAttribute('aria-valuetext')
      const valueMatch = /saturation:\s*(\d+(?:\.\d+)?)%,\s*brightness:\s*(\d+(?:\.\d+)?)%/iu.exec(
        valueText ?? '',
      )
      if (valueMatch) {
        slider.setAttribute(
          'aria-valuetext',
          t('colorPicker.saturationBrightnessValue', {
            saturation: valueMatch[1],
            brightness: valueMatch[2],
          }),
        )
      }
      return
    }

    const key = slider.getAttribute('data-accent-label-key') ?? inputLabelKeys[originalLabel]
    if (key) {
      slider.setAttribute('data-accent-label-key', key)
      slider.setAttribute('aria-label', t(`colorPicker.${key}`))
    }
  })

  syncCurrentColorAccessibility(host, activeColor, t)
}

export function syncCurrentColorAccessibility(
  host: HTMLElement,
  activeColor: string,
  t: Translate,
): void {
  const saturationSlider = host.querySelector<HTMLElement>('.vc-saturation-slider [role="slider"]')
  if (saturationSlider) {
    saturationSlider.setAttribute('aria-label', t('colorPicker.saturationBrightnessSlider'))
    const hsv = tinycolor(activeColor).toHsv()
    saturationSlider.setAttribute('aria-valuenow', hsv.s.toFixed(2))
    saturationSlider.setAttribute(
      'aria-valuetext',
      t('colorPicker.saturationBrightnessValue', {
        saturation: Math.round(hsv.s * 100),
        brightness: Math.round(hsv.v * 100),
      }),
    )
  }

  host.querySelectorAll<HTMLElement>('.presets [role="option"]').forEach((option) => {
    const selected = option.getAttribute('title')?.toUpperCase() === activeColor.toUpperCase()
    option.setAttribute('aria-selected', String(selected))
  })

  const currentColor = host.querySelector<HTMLElement>('.active-color')
  if (currentColor) {
    currentColor.setAttribute(
      'aria-label',
      t('colorPicker.currentColor', {
        color: tinycolor(activeColor).toRgbString(),
      }),
    )
  }
}
