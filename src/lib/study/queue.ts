import { dayKey } from './date.ts';
import { shuffle } from './random.ts';
import type { Rng } from './random.ts';
import type {
  AnswerResult,
  CardView,
  LearnAction,
  LearnConfig,
  LearnSessionState,
  Level,
  WordEntry,
  WordProgress,
} from './types.ts';

const DEFAULT_CONFIG: LearnConfig = {
  groupSize: 10,
  groupLayer: 3,
  level1Count: 3,
  level2Count: 3,
  level3Count: 4,
  level4Count: 5,
  optionCount: 4,
  shuffleNewWords: true,
};

interface QueueItem {
  entry: WordEntry;
  progress: WordProgress;
}

interface Snapshot {
  levels: string[][];
  progress: Map<string, WordProgress>;
  finished: number;
  currentId: string | null;
  lastSelectionId: string | null;
  groupComplete: boolean;
}

export function defaultProgress(wordId: string, today = new Date()): WordProgress {
  return {
    wordId,
    level: 0,
    state: 'new',
    position: 0,
    ef: 2.5,
    reps: 0,
    preReps: 0,
    intervalDays: 0,
    dueDate: dayKey(today),
    success: 0,
    fail: 0,
    cFail: 0,
    totalProcess: 0,
    process: 0,
    canUndo: false,
  };
}

function cloneProgress(progress: WordProgress): WordProgress {
  return { ...progress };
}

function clampLevel(level: number): Level {
  if (level <= 0) return 0;
  if (level >= 4) return 4;
  return level as Level;
}

/**
 * The learning queue from the shipped app's LeitnerCard.
 *
 * Five level arrays, a minimum of three level-1 items, and a priority order
 * that first drains levels above their quota and then falls back to level 1.
 * The current card is removed from its array while it is being answered.
 */
export class LearnSession {
  private readonly config: LearnConfig;
  private readonly rng: Rng;
  private readonly entries: WordEntry[];
  private readonly entryById = new Map<string, WordEntry>();
  private readonly progress: Map<string, WordProgress>;
  private levels: [QueueItem[], QueueItem[], QueueItem[], QueueItem[], QueueItem[]];
  private finished = 0;
  private total: number;
  private current: QueueItem | null = null;
  private lastSelection: WordEntry | null = null;
  private groupComplete = false;
  private undoStack: Snapshot[] = [];

  constructor(
    entries: readonly WordEntry[],
    progress: Map<string, WordProgress> | undefined,
    config: Partial<LearnConfig> = {},
    rng: Rng = Math.random,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.config.groupLayer = this.config.groupLayer === 4 ? 4 : 3;
    this.config.groupSize = Math.max(1, Math.floor(this.config.groupSize));
    this.config.level1Count = Math.max(1, Math.floor(this.config.level1Count));
    this.config.level2Count = Math.max(1, Math.floor(this.config.level2Count));
    this.config.level3Count = Math.max(1, Math.floor(this.config.level3Count));
    this.config.level4Count = Math.max(1, Math.floor(this.config.level4Count));
    this.config.optionCount = Math.max(1, Math.floor(this.config.optionCount));
    this.rng = rng;
    this.entries = [];
    this.progress = new Map();

    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      this.entries.push(entry);
      this.entryById.set(entry.id, entry);
      const existing = progress?.get(entry.id);
      this.progress.set(
        entry.id,
        existing ? cloneProgress(existing) : defaultProgress(entry.id),
      );
    }

    this.total = this.entries.length;
    this.levels = [[], [], [], [], []];

    for (const entry of this.entries) {
      const p = this.progress.get(entry.id)!;
      p.level = clampLevel(p.level);
      this.levels[p.level].push({ entry, progress: p });
    }

    // The original app randomises the new-word array before serving it.
    // Orangecy can turn this off to keep a song-first deck order.
    if (this.config.shuffleNewWords) {
      this.levels[0] = shuffle(this.levels[0], this.rng);
    }
    this.levels.forEach((items) => this.updatePositions(items));

    if (this.total === 0) this.groupComplete = true;
  }

  getConfig(): LearnConfig {
    return { ...this.config };
  }

  getProgress(wordId: string): WordProgress | undefined {
    const p = this.progress.get(wordId);
    return p ? { ...p } : undefined;
  }

  getProgressMap(): Map<string, WordProgress> {
    const copy = new Map<string, WordProgress>();
    for (const [id, p] of this.progress) copy.set(id, { ...p });
    return copy;
  }

  next(): CardView | null {
    if (this.current) return this.toCardView(this.current);
    if (this.groupComplete || this.finished >= this.total) {
      this.groupComplete = true;
      return null;
    }

    this.maintainLevel1();
    const item = this.select();
    if (!item) {
      this.groupComplete = true;
      return null;
    }

    this.current = item;
    this.lastSelection = item.entry;
    this.undoStack = [];

    if (item.progress.state === 'new') item.progress.state = 'learning';
    return this.toCardView(item);
  }

  answer(action: LearnAction): AnswerResult {
    if (!this.current) {
      throw new Error('No active card: call next() before answer().');
    }

    const before = this.current;
    const levelBefore = before.progress.level;
    const snapshot = this.takeSnapshot();
    this.undoStack = [snapshot];

    let terminal = false;
    let mastered = false;

    switch (action) {
      case 'know':
        before.progress.success += 1;
        mastered = this.applyKnow(before);
        terminal = mastered;
        break;
      case 'dontKnow':
        this.applyDontKnow(before);
        terminal = false;
        break;
      case 'vague':
        // The learning engine's iMayKnow is a no-op. The card is already out
        // of the queue, so it simply does not come back this session.
        terminal = true;
        break;
      case 'tooEasy':
        before.progress.state = 'skipped';
        before.progress.level = 0;
        before.progress.position = 0;
        before.progress.cFail = 0;
        before.progress.totalProcess += 1;
        terminal = true;
        break;
      default:
        throw new Error(`Unknown action: ${String(action)}`);
    }

    if (terminal) this.finished += 1;

    const result: AnswerResult = {
      entry: before.entry,
      action,
      levelBefore,
      levelAfter: before.progress.level,
      mastered,
      terminal,
      groupComplete: this.computeComplete(),
    };

    this.current = null;
    this.groupComplete = result.groupComplete;
    return result;
  }

  undo(): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;

    this.levels = [[], [], [], [], []];
    for (let level = 0; level < snapshot.levels.length; level += 1) {
      for (const id of snapshot.levels[level]) {
        const entry = this.entryById.get(id);
        const p = snapshot.progress.get(id);
        if (entry && p) this.levels[level as Level].push({ entry, progress: p });
      }
    }

    this.progress.clear();
    for (const [id, p] of snapshot.progress) this.progress.set(id, p);

    this.finished = snapshot.finished;
    this.groupComplete = snapshot.groupComplete;
    this.current = snapshot.currentId
      ? this.itemById(snapshot.currentId)
      : null;
    this.lastSelection = snapshot.lastSelectionId
      ? this.entryById.get(snapshot.lastSelectionId) ?? null
      : null;

    this.levels.forEach((items) => this.updatePositions(items));
    return true;
  }

  state(): LearnSessionState {
    return {
      levels: this.levels.map((items) => items.length) as [number, number, number, number, number],
      finished: this.finished,
      total: this.total,
      current: this.current ? this.toCardView(this.current) : null,
      groupComplete: this.groupComplete,
    };
  }

  private applyKnow(item: QueueItem): boolean {
    const p = item.progress;
    if (p.level < this.config.groupLayer) {
      p.level = clampLevel(p.level + 1);
      p.state = 'learning';
      this.levels[p.level].push(item);
      this.updatePositions(this.levels[p.level]);
      return false;
    }
    return this.finishMastered(item);
  }

  private finishMastered(item: QueueItem): boolean {
    const p = item.progress;
    p.state = 'mastered';
    p.level = 0;
    p.position = 0;
    p.ef = Math.max(2.5, p.ef);
    p.totalProcess += 1;
    return true;
  }

  private applyDontKnow(item: QueueItem): void {
    const p = item.progress;
    p.fail += 1;
    if (p.level >= 2) p.cFail += 1;
    p.level = 1;
    p.state = 'learning';

    const target = this.levels[1];
    const index = target.length >= 3 ? 2 : Math.min(2, target.length);
    target.splice(index, 0, item);
    this.updatePositions(target);
  }

  private maintainLevel1(): void {
    while (
      this.levels[1].length < this.config.level1Count &&
      this.levels[0].length > 0
    ) {
      const item = this.levels[0].shift()!;
      item.progress.level = 1;
      item.progress.state = 'learning';
      this.levels[1].push(item);
      this.updatePositions(this.levels[0]);
      this.updatePositions(this.levels[1]);
    }
  }

  private select(): QueueItem | null {
    if (this.levels[4].length > this.config.level4Count) {
      return this.take(this.levels[4], 0);
    }
    if (this.levels[3].length > this.config.level3Count) {
      return this.take(this.levels[3], 0);
    }
    if (this.levels[2].length > this.config.level2Count) {
      const index = this.avoidRepeatIndex(this.levels[2]);
      return this.take(this.levels[2], index);
    }
    if (this.levels[1].length > 0) {
      return this.take(this.levels[1], 0);
    }
    if (this.levels[3].length > 0) {
      return this.take(this.levels[3], 0);
    }
    if (this.levels[4].length > 0) {
      return this.take(this.levels[4], 0);
    }
    if (this.levels[2].length > 0) {
      return this.take(this.levels[2], this.avoidRepeatIndex(this.levels[2]));
    }
    return null;
  }

  private take(items: QueueItem[], index: number): QueueItem {
    const [item] = items.splice(index, 1);
    this.updatePositions(items);
    return item;
  }

  private avoidRepeatIndex(items: QueueItem[]): number {
    if (items.length < 2 || !this.lastSelection) return 0;
    const repeated = items.findIndex((item) => item.entry.id === this.lastSelection!.id);
    if (repeated < 0) return 0;
    const alternative = items.findIndex((item) => item.entry.id !== this.lastSelection!.id);
    return alternative >= 0 ? alternative : 0;
  }

  private updatePositions(items: QueueItem[]): void {
    for (let i = 0; i < items.length; i += 1) {
      items[i].progress.position = i;
      items[i].progress.level = clampLevel(items[i].progress.level);
    }
  }

  private itemById(id: string): QueueItem | null {
    const entry = this.entryById.get(id);
    const p = this.progress.get(id);
    return entry && p ? { entry, progress: p } : null;
  }

  private toCardView(item: QueueItem): CardView {
    return {
      entry: item.entry,
      progress: { ...item.progress },
      index: this.finished + 1,
      total: this.total,
      level: item.progress.level,
      canUndo: this.undoStack.length > 0,
    };
  }

  private computeComplete(): boolean {
    if (this.finished >= this.total) return true;
    return this.levels.every((items) => items.length === 0);
  }

  private takeSnapshot(): Snapshot {
    const progress = new Map<string, WordProgress>();
    for (const [id, p] of this.progress) progress.set(id, { ...p });
    return {
      levels: this.levels.map((items) => items.map((item) => item.entry.id)),
      progress,
      finished: this.finished,
      currentId: this.current?.entry.id ?? null,
      lastSelectionId: this.lastSelection?.id ?? null,
      groupComplete: this.groupComplete,
    };
  }
}

export function createLearnSession(
  entries: readonly WordEntry[],
  progress: Map<string, WordProgress> | undefined = undefined,
  config: Partial<LearnConfig> = {},
  rng: Rng = Math.random,
): LearnSession {
  return new LearnSession(entries, progress, config, rng);
}

/** A deterministic RNG useful in tests and demos. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
