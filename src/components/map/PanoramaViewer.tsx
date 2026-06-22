'use client'

import { useEffect, useRef } from 'react'

interface PanoramaViewerProps {
  imageUrl: string
  autoLoad?: boolean
  compass?: boolean
}

export function PanoramaViewer({ imageUrl, autoLoad = true, compass = true }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)

  useEffect(() => {
    if (!document.querySelector('link[href*="pannellum.css"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/pannellum.css'
      document.head.appendChild(link)
    }

    const initViewer = () => {
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
      initViewer()
    } else {
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
