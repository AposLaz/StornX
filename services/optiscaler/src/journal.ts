import type { WorkloadChanged } from '@stornx/event-contracts';
import type { Database, Transaction } from '@stornx/platform/database.js';

/**
 * Durable intent describing one absolute replica change and the workload version it was based
 * on.
 */
export interface ScaleOperation {
  id: string;
  cluster_id: string;
  namespace: string;
  name: string;
  uid: string;
  original: number;
  target: number;
  generation: number;
  candidate: string | null;
  status: string;
  created_at: Date;
  input: Record<string, unknown>;
}

/** Initial scaler schema, applied explicitly with migration credentials before runtime startup. */
export const migration = `
  CREATE SCHEMA IF NOT EXISTS optiscaler;

  CREATE TABLE IF NOT EXISTS optiscaler.schema_version (
    version integer PRIMARY KEY
  );

  INSERT INTO optiscaler.schema_version
  VALUES (1)
  ON CONFLICT DO NOTHING;

  CREATE TABLE IF NOT EXISTS optiscaler.operations (
    id uuid PRIMARY KEY,
    cluster_id text NOT NULL,
    namespace text NOT NULL,
    name text NOT NULL,
    uid text NOT NULL,
    original integer NOT NULL,
    target integer NOT NULL,
    generation bigint NOT NULL,
    candidate text,
    status text NOT NULL DEFAULT 'pending',
    input jsonb NOT NULL,
    policy_version text NOT NULL DEFAULT '1.0.0',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    error text,
    CHECK (original >= 0 AND target >= 0),
    CHECK (status IN ('pending', 'applied', 'superseded', 'blocked', 'dry-run'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS one_pending_scale
    ON optiscaler.operations (cluster_id, namespace, uid)
    WHERE status = 'pending';

  CREATE INDEX IF NOT EXISTS scale_workload_history
    ON optiscaler.operations (cluster_id, namespace, uid, updated_at DESC);

  CREATE TABLE IF NOT EXISTS optiscaler.outbox (
    id uuid PRIMARY KEY REFERENCES optiscaler.operations (id),
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    attempts integer NOT NULL DEFAULT 0,
    error text
  );
`;

/** Own scaler audit records and the outbox without accessing the balancer schema. */
export class ScalerJournal {
  constructor(readonly db: Database) {}

  /**
   * Require the expected schema version; applications never create or migrate tables on startup.
   */
  async verify(): Promise<void> {
    const result = await this.db.pool.query('SELECT version FROM optiscaler.schema_version');

    if (result.rows.length !== 1 || result.rows[0].version !== 1) {
      throw new Error('Unsupported scaler journal schema; run migrations');
    }
  }

  /** Load this cluster's unfinished operations in recovery order. */
  async pending(clusterId: string): Promise<ScaleOperation[]> {
    return (
      await this.db.pool.query(
        `
          SELECT *
          FROM optiscaler.operations
          WHERE status = 'pending'
            AND cluster_id = $1
          ORDER BY created_at
        `,
        [clusterId],
      )
    ).rows;
  }

  /**
   * Persist intent before contacting Kubernetes; the supplied connection may also hold the
   * placement lock.
   */
  async create(tx: Transaction, op: ScaleOperation): Promise<void> {
    await tx.query(
      `
        INSERT INTO optiscaler.operations (
          id,
          cluster_id,
          namespace,
          name,
          uid,
          original,
          target,
          generation,
          candidate,
          status,
          input
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        op.id,
        op.cluster_id,
        op.namespace,
        op.name,
        op.uid,
        op.original,
        op.target,
        op.generation,
        op.candidate,
        op.status,
        JSON.stringify(op.input),
      ],
    );
  }

  /**
   * Block a new decision while an operation is unfinished or its durable cooldown has not
   * expired.
   */
  async cooling(
    tx: Transaction,
    cluster: string,
    ns: string,
    uid: string,
    seconds: number,
  ): Promise<boolean> {
    const rows = await tx.query(
      `
        SELECT 1
        FROM optiscaler.operations
        WHERE cluster_id = $1
          AND namespace = $2
          AND uid = $3
          AND (
            status = 'pending'
            OR (
              status = 'applied'
              AND updated_at > now() - ($4 * interval '1 second')
            )
          )
        LIMIT 1
      `,
      [cluster, ns, uid, seconds],
    );

    return rows.rowCount !== 0;
  }

  /**
   * Commit the outcome and optional outbox entry atomically so a completed scale is not left
   * unannounced.
   */
  async finish(
    op: ScaleOperation,
    status: 'applied' | 'superseded' | 'blocked',
    event?: WorkloadChanged,
    error?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `
          UPDATE optiscaler.operations
          SET status = $2, updated_at = now(), error = $3
          WHERE id = $1
        `,
        [op.id, status, error ?? null],
      );

      if (event) {
        await tx.query(
          `
            INSERT INTO optiscaler.outbox (id, payload)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `,
          [op.id, JSON.stringify(event)],
        );
      }
    });
  }

  /** Keep an ambiguous operation pending and record the failure for the next recovery attempt. */
  async error(id: string, error: unknown): Promise<void> {
    await this.db.pool.query('UPDATE optiscaler.operations SET error=$2 WHERE id=$1', [
      id,
      String(error),
    ]);
  }

  /**
   * Publish this cluster's outbox in order. Unconfirmed rows remain available for safe
   * redelivery.
   */
  async publish(clusterId: string, send: (event: WorkloadChanged) => Promise<void>): Promise<void> {
    const rows = await this.db.pool.query(
      `
        SELECT o.id, o.payload
        FROM optiscaler.outbox o
        JOIN optiscaler.operations p ON p.id = o.id
        WHERE o.published_at IS NULL
          AND p.cluster_id = $1
        ORDER BY o.created_at
        LIMIT 100
      `,
      [clusterId],
    );

    for (const row of rows.rows) {
      try {
        await send(row.payload);
        await this.db.pool.query(
          `
            UPDATE optiscaler.outbox
            SET published_at = now(), error = NULL
            WHERE id = $1
          `,
          [row.id],
        );
      } catch (error) {
        await this.db.pool.query(
          `
            UPDATE optiscaler.outbox
            SET attempts = attempts + 1, error = $2
            WHERE id = $1
          `,
          [row.id, String(error)],
        );

        throw error;
      }
    }
  }
}
