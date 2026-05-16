/** Max digits (excluding the decimal separator), matching prior keypad behavior. */
export const TRADE_QTY_MAX_DIGITS = 12

/** Allow digits + single `.`; cap digit count for parity with the old custom keypad. */
export function sanitizeTradeQtyInput(raw: string): string {
  let v = raw.replace(/[^\d.]/g, '')
  const firstDot = v.indexOf('.')
  if (firstDot !== -1) {
    v = `${v.slice(0, firstDot + 1)}${v.slice(firstDot + 1).replace(/\./g, '')}`
  }
  const digitCount = v.replace(/\./g, '').length
  if (digitCount <= TRADE_QTY_MAX_DIGITS) return v

  let count = 0
  let out = ''
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]!
    if (ch === '.') {
      if (!out.includes('.')) out += ch
      continue
    }
    if (/\d/.test(ch)) {
      if (count >= TRADE_QTY_MAX_DIGITS) continue
      count += 1
      out += ch
    }
  }
  return out
}
