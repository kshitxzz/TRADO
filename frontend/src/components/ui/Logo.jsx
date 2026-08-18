// ─── Trado logo. Icon + wordmark are separate elements (not one fused
// image) so the text stays crisp and independently sized at any scale.
//
// Text color uses the CSS variable --text-primary directly, the same
// variable every other label in the app already uses to correctly switch
// between light/dark themes — rather than a JS-computed theme value. That
// removes any risk of the logo's color going out of sync with the actual
// rendered theme.
//
// `variant="icon"`   → just the square mark.
// `variant="full"`   → icon + "trado" wordmark side by side (default).
// `height`           → sizes the icon (px); wordmark scales proportionally.
// `forceTheme`       → pins the wordmark to white/black regardless of the
//                       active theme — for fixed-background contexts only
//                       (e.g. the always-dark shareable performance card).
export default function Logo({ variant = 'full', height = 32, className = '', style = {}, forceTheme = null }) {
  if (variant === 'icon') {
    return (
      <img
        src="/trado-logo.png"
        alt="Trado"
        className={className}
        style={{ height, width: 'auto', display: 'block', ...style }}
      />
    )
  }

  const textColor = forceTheme
    ? (forceTheme === 'dark' ? '#FFFFFF' : '#0A0A0F')
    : 'var(--text-primary)'

  return (
    <div className={`flex items-center ${className}`} style={{ gap: Math.max(5, Math.round(height * 0.22)), ...style }}>
      <img
        src="/trado-logo.png"
        alt=""
        style={{ height, width: 'auto', display: 'block', flexShrink: 0 }}
      />
      <span
        style={{
          fontSize: Math.round(height * 0.62),
          lineHeight: 1,
          fontWeight: 800,
          letterSpacing: '-0.01em',
          color: textColor,
        }}
      >
        trado
      </span>
    </div>
  )
}