'use client'

import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  onScan: (nodeId: string) => void
  onError?: (error: string) => void
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        let nodeId = decodedText
        const match = decodedText.match(/[?&]node=([^&]+)/)
        if (match) {
          nodeId = decodeURIComponent(match[1])
        }
        onScan(nodeId)
        scanner.stop().catch(() => {})
      },
      () => { /* ignore non-decode frames */ }
    ).catch((err) => {
      onError?.(err?.toString() ?? 'Camera error')
    })

    return () => {
      scanner.stop().catch(() => {})
      scannerRef.current = null
    }
  }, [onScan, onError])

  return <div id="qr-reader" />
}
