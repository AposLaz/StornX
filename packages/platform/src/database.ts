import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { Settings } from './settings.js';
import { logger } from './config/logger.js';

export type Transaction = pg.PoolClient;

/** Own PostgreSQL connections, transactions and session-scoped mutation locks. */
export class Database {
  readonly pool: pg.Pool;
  private readonly heldLocks = new Set<Transaction>();

  constructor(config: Pick<Settings, 'databaseUrl' | 'dbTls' | 'dbCa'>) {
    const url = new URL(config.databaseUrl);

    if (config.dbTls) {
      // URL SSL options must not override the service's verified TLS configuration.
      for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl']) {
        url.searchParams.delete(key);
      }
    }

    this.pool = new pg.Pool({
      connectionString: url.toString(),
      max: 5,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
      ssl: config.dbTls
        ? {
            rejectUnauthorized: true,
            ...(config.dbCa ? { ca: readFileSync(config.dbCa, 'utf8') } : {}),
          }
        : undefined,
    });
    this.pool.on('error', (error) =>
      logger.error('Idle database connection lost', { error: String(error) }),
    );
  }

  /**
   * Commit the callback's database writes together; roll back on failure.
   * External effects such as Kubernetes mutations are outside this transaction.
   *
   * @param run - Database work performed on a single transaction connection.
   * @returns The callback result after a successful commit.
   * @throws The callback or database error; failed rollback connections are discarded.
   */
  async transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = await this.pool.connect();
    let connectionError: Error | undefined;
    const onError = (error: Error) => {
      connectionError = error;
    };

    tx.on('error', onError);

    try {
      await tx.query('BEGIN');

      const result = await run(tx);

      await tx.query('COMMIT');

      return result;
    } catch (error) {
      await tx.query('ROLLBACK').catch((rollbackError: Error) => {
        connectionError = rollbackError;
      });

      throw error;
    } finally {
      tx.removeListener('error', onError);
      // A failed rollback leaves the connection unsafe to return to the pool.
      tx.release(connectionError);
    }
  }

  /**
   * Run while holding a session-scoped advisory lock, skipping this attempt if already owned.
   * The callback does not run inside a transaction unless it explicitly starts one.
   *
   * @param key - Stable resource identity scoped to the cluster and managed object.
   * @param run - Work that must be serialized, using the connection that holds the lock.
   * @returns The callback result, or undefined when a competing owner holds the lock.
   */
  async lock<T>(key: string, run: (tx: Transaction) => Promise<T>): Promise<T | undefined> {
    const tx = await this.pool.connect();
    let locked = false;
    let connectionError: Error | undefined;
    const onError = (error: Error) => {
      connectionError = error;
    };

    tx.on('error', onError);

    try {
      locked = (
        await tx.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [key])
      ).rows[0].locked;

      if (!locked) {
        return undefined;
      }

      this.heldLocks.add(tx);

      return await run(tx);
    } finally {
      this.heldLocks.delete(tx);

      if (locked) {
        await tx
          .query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key])
          .catch((unlockError: Error) => {
            connectionError = unlockError;
          });
      }

      tx.removeListener('error', onError);
      // Destroy a connection when unlock fails, rather than pooling a session that may hold the lock.
      tx.release(connectionError);
    }
  }

  /** Check that mutation-lock connections are still usable before a Kubernetes write. */
  async assertLocks(): Promise<void> {
    if (!this.heldLocks.size) {
      throw new Error('A database mutation lock is required');
    }

    for (const tx of this.heldLocks) {
      await tx.query('SELECT 1');
    }
  }
}
