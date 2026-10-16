import { randomUUID } from 'node:crypto';
import { statusCode } from './kube.js';
import type { Clients } from './kube.js';
import type { Settings } from './settings.js';

/** Use a Kubernetes Lease to select one active process for this service. */
export class Leader {
  readonly identity = `${process.env.HOSTNAME ?? 'local'}-${randomUUID()}`;
  private lastRenewed = 0;
  private stopped = false;

  constructor(
    private readonly api: Clients,
    private readonly config: Settings,
  ) {}

  /** Expire local permission to mutate before the remote lease can be taken over. */
  get active(): boolean {
    return !this.stopped && Date.now() - this.lastRenewed < 8000;
  }

  /** Refuse work when the most recent lease renewal is no longer trusted. */
  assert(): void {
    if (!this.active) {
      throw new Error('Leadership unavailable; refusing mutation');
    }
  }

  /** Revoke local leadership immediately during shutdown. */
  stop(): void {
    this.stopped = true;
    this.lastRenewed = 0;
  }

  /** Renew or acquire the Lease using its resource version to reject competing updates. */
  async tick(): Promise<void> {
    if (this.stopped) {
      return;
    }

    const name = this.config.leaseName;
    const namespace = this.config.leaseNamespace;

    try {
      const lease = await this.api.coordination.readNamespacedLease({
        name,
        namespace,
      });
      const expiry =
        new Date(lease.spec?.renewTime ?? 0).getTime() +
        (lease.spec?.leaseDurationSeconds ?? 20) * 1000;

      if (lease.spec?.holderIdentity !== this.identity && expiry > Date.now()) {
        this.lastRenewed = 0;

        return;
      }

      await this.api.coordination.replaceNamespacedLease({
        name,
        namespace,
        body: {
          ...lease,
          spec: {
            ...lease.spec,
            holderIdentity: this.identity,
            leaseDurationSeconds: 20,
            renewTime: new Date(),
            leaseTransitions:
              (lease.spec?.leaseTransitions ?? 0) +
              (lease.spec?.holderIdentity === this.identity ? 0 : 1),
          },
        },
      });

      if (!this.stopped) {
        this.lastRenewed = Date.now();
      }
    } catch (error) {
      this.lastRenewed = 0;

      if (statusCode(error) !== 404) {
        throw error;
      }

      try {
        await this.api.coordination.createNamespacedLease({
          namespace,
          body: {
            metadata: { name, namespace },
            spec: {
              holderIdentity: this.identity,
              leaseDurationSeconds: 20,
              renewTime: new Date(),
            },
          },
        });

        if (!this.stopped) {
          this.lastRenewed = Date.now();
        }
      } catch (createError) {
        if (statusCode(createError) !== 409) {
          throw createError;
        }
      }
    }
  }
}
