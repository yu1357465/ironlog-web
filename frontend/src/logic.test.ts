import { describe, expect, it } from 'vitest'
import { formatNumber, formatWeight, fromKg, toKg } from './format'
import { translate } from './i18n'
import { qrMatrix } from './qr'

describe('format', () => {
  it('drops trailing zeros', () => {
    expect(formatNumber(40)).toBe('40')
    expect(formatNumber(42.5)).toBe('42.5')
    expect(formatNumber(42.04)).toBe('42')
  })
  it('converts pounds both ways', () => {
    expect(formatWeight(100, 'LBS')).toBe('220.5')
    expect(toKg(fromKg(100, 'LBS'), 'LBS')).toBeCloseTo(100)
  })
})

describe('i18n', () => {
  it('fills variables and falls back per key', () => {
    expect(translate('en', 'today.finishRemaining', { n: 3 })).toBe('Finish workout · 3 left')
    expect(translate('zh', 'today.finishRemaining', { n: 3 })).toBe('结束训练 · 还剩 3 个')
  })
})

describe('qr', () => {
  it('encodes a typical share code', () => {
    const m = qrMatrix('FP1:' + 'A'.repeat(600))
    expect(m).not.toBeNull()
    expect(m!.length).toBe(m![0].length)
  })
  it('returns null when content is too large for a QR code', () => {
    expect(qrMatrix('FP1:' + 'A'.repeat(5000))).toBeNull()
  })
})
