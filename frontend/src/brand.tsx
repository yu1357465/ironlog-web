/**
 * IronLog brand marks, identical to the Android app:
 * - AppLogo: the launcher icon itself (same PNG as ironlog-android).
 * - AppMark: single-colour silhouette for nav tabs and empty states; same geometry as
 *   ironlog-android `ui/theme/AppIcons.kt`. Filled when selected, hollow heads otherwise.
 */
import iconUrl from './assets/icon.png'

export function AppLogo({ size = 32, className }: { size?: number; className?: string }) {
  return <img src={iconUrl} width={size} height={size} alt="IronLog" className={className}
              style={{ borderRadius: size * 0.22 }} />
}

// Unrotated (horizontal) geometry in a 24×24 box, then rotated −45°: two chamfered heads joined by a bar.
const head = (x0: number, x1: number) => `M${x0 + 1.4} 7H${x1 - 1.4}L${x1} 8.4V15.6L${x1 - 1.4} 17H${x0 + 1.4}L${x0} 15.6V8.4Z`
const hole = (x0: number) => `M${x0} 9.8H${x0 + 2.6}V14.2H${x0}Z`
const FILLED = head(2.5, 7.5) + head(16.5, 21.5) + 'M7.5 10.8H16.5V13.2H7.5Z'
const OUTLINED = FILLED + hole(3.7) + hole(17.7)

export function AppMark({ size = 24, filled = true, className }: { size?: number; filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d={filled ? FILLED : OUTLINED} fill="currentColor" fillRule="evenodd" transform="rotate(-45 12 12)" />
    </svg>
  )
}
