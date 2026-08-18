import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Download, Share2, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  SHARE_FORMATS, renderTradeShareCard, tradeShareCardBlob, shareCardFileName,
} from '../../lib/tradeShareCard'

const FORMAT_ORDER = ['story', 'post', 'landscape']
const MAX_PREVIEW_W = 380
const MAX_PREVIEW_H = 460

export default function ShareTradeModal({ trade, open, onClose }) {
  const [formatKey, setFormatKey] = useState('post')
  const [rendering, setRendering] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const canvasRef = useRef(null)

  const fmt = SHARE_FORMATS[formatKey]
  const scale = useMemo(() => {
    if (!fmt) return 1
    return Math.min(MAX_PREVIEW_W / fmt.w, MAX_PREVIEW_H / fmt.h)
  }, [fmt])

  useEffect(() => {
    if (!open || !trade) return
    let cancelled = false
    setRendering(true)
    renderTradeShareCard(canvasRef.current, trade, formatKey)
      .finally(() => { if (!cancelled) setRendering(false) })
    return () => { cancelled = true }
  }, [open, trade, formatKey])

  useEffect(() => { if (open) setFormatKey('post') }, [open, trade?.id])

  if (!open || !trade) return null


  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = await tradeShareCardBlob(trade, formatKey)
      if (!blob) throw new Error('render failed')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = shareCardFileName(trade, formatKey)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Card downloaded!')
    } catch {
      toast.error('Could not generate the image — try again')
    } finally {
      setDownloading(false)
    }
  }

  async function handleShare() {
    try {
      const blob = await tradeShareCardBlob(trade, formatKey)
      if (!blob) throw new Error('render failed')
      const file = new File([blob], shareCardFileName(trade, formatKey), { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My trade on Trado' })
      } else {
        await handleDownload()
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        toast.error('Sharing failed — downloading instead')
        await handleDownload()
      }
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="w-full max-w-lg rounded-2xl flex flex-col"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', maxHeight: '92vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0"
               style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                   style={{ background: 'var(--gradient-primary)' }}>
                <Share2 size={14} />
              </div>
              <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Share Trade</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    style={{ color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col items-center">

            {/* Live preview */}
            <div className="relative flex items-center justify-center rounded-xl overflow-hidden mb-5"
                 style={{ width: fmt.w * scale, height: fmt.h * scale, background: '#0A0A0F', border: '1px solid var(--border-subtle)' }}>
              <canvas ref={canvasRef}
                      style={{ width: fmt.w * scale, height: fmt.h * scale, display: 'block' }} />
              {rendering && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                  <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent-purple-light)' }} />
                </div>
              )}
            </div>

            {/* Format tabs */}
            <div className="grid grid-cols-3 gap-2 w-full mb-5">
              {FORMAT_ORDER.map(key => {
                const f = SHARE_FORMATS[key]
                const active = key === formatKey
                return (
                  <button key={key} onClick={() => setFormatKey(key)}
                          className="rounded-xl py-2.5 flex flex-col items-center gap-0.5 transition-all"
                          style={{
                            background: active ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${active ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                          }}>
                    <span className="text-sm font-bold" style={{ color: active ? 'var(--accent-purple-light)' : 'var(--text-primary)' }}>
                      {f.label}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{f.w}×{f.h}</span>
                  </button>
                )
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-3 w-full">
              <button onClick={handleDownload} disabled={downloading || rendering}
                      className="btn-primary flex-1 text-sm py-2.5 justify-center disabled:opacity-60">
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Download PNG
              </button>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button onClick={handleShare} disabled={rendering}
                        className="btn-outline text-sm py-2.5 px-4 disabled:opacity-60">
                  <Share2 size={14} />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}