/** Seeded mulberry32. Dice, pairing, and skill noise all go through this. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inclusive 1–6. */
  die(): number {
    return 1 + Math.floor(this.next() * 6);
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    if (n <= 0) throw new Error(`Rng.int expected n > 0, got ${n}`);
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick on empty list");
    return items[this.int(items.length)]!;
  }
}
