declare module "sql.js" {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  interface Statement {
    getAsObject(): Record<string, any>;
    bind(params?: any[]): boolean;
    step(): boolean;
    reset(): boolean;
    get(params?: any[]): any[];
    free(): boolean;
  }

  export type { Database, SqlJsStatic, QueryExecResult, Statement };
  export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}
