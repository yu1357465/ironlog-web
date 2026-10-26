/** QR code generation (qrcode-generator) and reading (BarcodeDetector when available, otherwise jsQR, loaded lazily). */
import qrcode from 'qrcode-generator'

/** Module matrix, or null when the content does not fit in a QR code. */
export function qrMatrix(text: string): boolean[][] | null {
  try {
    const qr = qrcode(0, 'M') // version auto; medium error correction, same as the Android app
    qr.addData(text, 'Byte')
    qr.make()
    const n = qr.getModuleCount()
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
  } catch {
    return null
  }
}

/** SVG path covering the dark modules (one unit per module). */
export function qrPath(m: boolean[][]): string {
  let d = ''
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z` }))
  return d
}

/** Shareable PNG: QR code, plan name and a hint underneath, on white so it reads well in chat apps. */
export async function posterBlob(m: boolean[][], title: string, subtitle: string, hint: string): Promise<Blob> {
  const W = 1080, pad = 72, qrSize = W - pad * 2, H = pad + qrSize + 300
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  const quiet = 1, cell = qrSize / (m.length + quiet * 2)
  ctx.fillStyle = '#000'
  m.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) ctx.fillRect(pad + (x + quiet) * cell, pad + (y + quiet) * cell, Math.ceil(cell), Math.ceil(cell))
  }))
  const font = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#1c2024'
  ctx.font = `bold 60px ${font}`
  ctx.fillText(ellipsize(ctx, title, W - pad * 2), W / 2, pad + qrSize + 110)
  ctx.fillStyle = '#68717b'
  ctx.font = `38px ${font}`
  ctx.fillText(ellipsize(ctx, subtitle, W - pad * 2), W / 2, pad + qrSize + 180)
  ctx.fillText(hint, W / 2, pad + qrSize + 240)
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s && ctx.measureText(s + '…').width > max) s = s.slice(0, -1)
  return s + '…'
}

// ---------------- reading ----------------

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

const nativeDetector = (): Detector | null => {
  try {
    return window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null
  } catch {
    return null
  }
}

async function jsqrDecode(source: CanvasImageSource, w: number, h: number): Promise<string | null> {
  const { default: jsQR } = await import('jsqr')
  const scale = Math.min(1, 1600 / Math.max(w, h)) // large photos: downscale first, faster and more reliable
  const cw = Math.round(w * scale), ch = Math.round(h * scale)
  const canvas = Object.assign(document.createElement('canvas'), { width: cw, height: ch })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, cw, ch)
  const data = ctx.getImageData(0, 0, cw, ch)
  return jsQR(data.data, cw, ch, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

export async function decodeImageFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const native = nativeDetector()
    if (native) {
      const found = await native.detect(bitmap).catch(() => [])
      if (found[0]) return found[0].rawValue
    }
    return await jsqrDecode(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

/** Scan frames from a playing <video> until a QR code is found or the signal aborts. */
export async function scanVideo(video: HTMLVideoElement, signal: AbortSignal): Promise<string | null> {
  const native = nativeDetector()
  while (!signal.aborted) {
    if (video.readyState >= 2 && video.videoWidth) {
      const text = native
        ? (await native.detect(video).catch(() => []))[0]?.rawValue ?? null
        : await jsqrDecode(video, video.videoWidth, video.videoHeight)
      if (text) return text
    }
    await new Promise(r => setTimeout(r, 250))
  }
  return null
}
