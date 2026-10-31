declare module 'pg' {
  export interface QueryResult<Row = Record<string, unknown>> {
    rows: Row[]
    rowCount: number | null
  }

  export interface Queryable {
    query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>
  }

  export class Pool implements Queryable {
    constructor(config?: Record<string, unknown>)
    connect(): Promise<Queryable & { release(error?: Error): void }>
    query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>
    end(): Promise<void>
    on(event: 'error', listener: (error: Error) => void): this
  }

  export class Client implements Queryable {
    constructor(config?: Record<string, unknown>)
    connect(): Promise<void>
    query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>
    end(): Promise<void>
  }

  const pg: { Pool: typeof Pool; Client: typeof Client }
  export default pg
}
