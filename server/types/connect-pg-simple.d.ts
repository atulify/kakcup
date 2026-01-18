declare module 'connect-pg-simple' {
  import { SessionOptions, Store } from 'express-session';
  import { Pool } from 'pg';

  interface PgSessionOptions {
    pool?: Pool;
    tableName?: string;
    createTableIfMissing?: boolean;
    pruneSessionInterval?: number | false;
    errorLog?: (...args: any[]) => void;
  }

  function connectPgSimple(session: any): {
    new (options?: PgSessionOptions): Store;
  };

  export = connectPgSimple;
}
