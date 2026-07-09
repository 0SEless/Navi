export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented yet`)
    this.name = 'NotImplementedError'
  }
}

export class SearchAPI {
  query(_text: string): never {
    throw new NotImplementedError('SearchAPI.query')
  }
}
