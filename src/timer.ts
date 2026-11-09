/** Totals only: never persist a running timestamp, so closed time cannot accrue. */
export class FileTimer {
  readonly totals: Record<string, number> = Object.create(null);
  private path: string | null = null;
  private last: number | null = null;

  constructor(saved: unknown = {}) {
    if (saved && typeof saved === 'object') {
      for (const [path, ms] of Object.entries(saved)) {
        if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) this.totals[path] = ms;
      }
    }
  }

  update(now: number, nextPath: string | null): void {
    if (this.last !== null && this.path !== null) {
      const elapsed = now - this.last;
      // Discard sleep, suspended rendering, and clock discontinuities.
      if (elapsed > 0 && elapsed <= 2500) {
        this.totals[this.path] = (this.totals[this.path] ?? 0) + elapsed;
      }
    }
    this.last = now;
    this.path = nextPath;
  }

  rename(oldPath: string, newPath: string): void {
    for (const path of Object.keys(this.totals)) {
      if (path === oldPath || path.startsWith(oldPath + '/')) {
        const target = newPath + path.slice(oldPath.length);
        this.totals[target] = (this.totals[target] ?? 0) + this.totals[path];
        delete this.totals[path];
      }
    }
    if (this.path === oldPath || this.path?.startsWith(oldPath + '/')) {
      this.path = newPath + this.path.slice(oldPath.length);
    }
  }

  remove(path: string): void {
    for (const key of Object.keys(this.totals)) {
      if (key === path || key.startsWith(path + '/')) delete this.totals[key];
    }
    if (this.path === path || this.path?.startsWith(path + '/')) this.path = null;
  }
}

export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}
