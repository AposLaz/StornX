export class Mutex {
  private _locked = false;
  private readonly _waiting: (() => void)[] = [];

  async lock() {
    if (this._locked) {
      await new Promise<void>((resolve) => this._waiting.push(resolve));
    }
    this._locked = true;
  }

  unlock() {
    this._locked = false;
    if (this._waiting.length > 0) {
      const next = this._waiting.shift();
      next?.();
    }
  }
}

// Singleton pattern
export const taintMutex = new Mutex();
