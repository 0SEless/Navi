'use client'

import { useEffect, useRef } from 'react'
import 'pannellum/build/pannellum.css'

interface PanoramaViewerProps {
  imageUrl: string
  autoLoad?: boolean
  compass?: boolean
}

export function PanoramaViewer({ imageUrl, autoLoad = true, compass = true }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)

  const scriptLoadedRef = useRef(false)

  useEffect(() => {
    const initViewer = () => {
      scriptLoadedRef.current = true
      if (!containerRef.current) return
      if (viewerRef.current) {
        viewerRef.current.destroy?.()
        viewerRef.current = null
      }
      viewerRef.current = (window as any).pannellum.viewer(containerRef.current, {
        type: 'equirectangular',
        panorama: imageUrl,
        autoLoad,
        compass,
      })
    }

    if ((window as any).pannellum) {
      scriptLoadedRef.current = true
      initViewer()
    } else if (!scriptLoadedRef.current) {
      const script = document.createElement('script')
      script.src = '/pannellum.js'
      script.onload = initViewer
      document.body.appendChild(script)
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy?.()
        viewerRef.current = null
      }
    }
  }, [imageUrl, autoLoad, compass])

  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />
}
