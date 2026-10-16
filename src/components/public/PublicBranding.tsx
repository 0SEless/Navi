import Image from 'next/image'

const SYMBOL_SIZE = { width: 1088, height: 886 }
const WORDMARK_SIZE = { width: 382, height: 116 }

interface WordmarkArtworkProps {
  className: string
}

function WordmarkArtwork({ className }: WordmarkArtworkProps) {
  return (
    <span className={`navi-brand-wordmark relative block shrink-0 ${className}`} aria-hidden="true">
      <Image
        data-brand-part="wordmark-light"
        src="/brand/navi-wordmark-light.png"
        alt=""
        aria-hidden="true"
        width={WORDMARK_SIZE.width}
        height={WORDMARK_SIZE.height}
        unoptimized
        className="navi-brand-wordmark-light absolute inset-0 h-full w-full object-contain"
      />
      <Image
        data-brand-part="wordmark-dark"
        src="/brand/navi-wordmark-dark.png"
        alt=""
        aria-hidden="true"
        width={384}
        height={119}
        unoptimized
        className="navi-brand-wordmark-dark absolute inset-0 h-full w-full object-contain"
      />
    </span>
  )
}

interface NaviBrandLockupProps {
  className: string
  symbolClassName: string
  wordmarkClassName: string
  testId: string
}

export function NaviBrandLockup({ className, symbolClassName, wordmarkClassName, testId }: NaviBrandLockupProps) {
  return (
    <span className={className} data-testid={testId} role="img" aria-label="NAVI">
      <Image
        data-brand-part="symbol"
        src="/brand/navi-navigation-symbol.png"
        alt=""
        aria-hidden="true"
        width={SYMBOL_SIZE.width}
        height={SYMBOL_SIZE.height}
        unoptimized
        className={`block shrink-0 object-contain ${symbolClassName}`}
      />
      <WordmarkArtwork className={wordmarkClassName} />
    </span>
  )
}

interface NaviWordmarkProps {
  className: string
  testId: string
}

export function NaviWordmark({ className, testId }: NaviWordmarkProps) {
  return (
    <span className={className} data-testid={testId} role="img" aria-label="NAVI wordmark">
      <WordmarkArtwork className="h-full w-full" />
    </span>
  )
}
