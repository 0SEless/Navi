export interface LoaderOptions {
  baseUrl: string
  fetch?: (url: string) => Promise<Response>
}

export class LoadError extends Error {
  constructor(
    message: string,
    public readonly code: 'MISSING_FILE' | 'INVALID_JSON' | 'CHECKSUM_MISMATCH' | 'UNSUPPORTED_VERSION',
  ) {
    super(message)
    this.name = 'LoadError'
  }
}
