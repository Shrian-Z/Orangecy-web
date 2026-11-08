import type { WordbookWord } from '@/lib/wordbook';
import type { LyricWord } from '@/types';
import { wordPhase } from '@/lyrics/timing';

/**
 * Renders one lyric line as word tokens: whitespace is preserved, wordbook
 * entries are clickable targets, and word-level timestamps produce the
 * waiting / singing / sung phase classes.
 *
 * The wordbook-entry path is the organ extracted verbatim from the legacy lyric
 * stage during the ammo migration. The focus card adds one optional surface
 * target (`target`) so the studied word is highlighted without a click card.
 */
export function WordSpans({
  text,
  entries,
  focusKey,
  target,
  wordTimes,
  activeTime,
  onWord,
}: {
  text: string;
  entries?: Map<string, WordbookWord>;
  focusKey?: string;
  target?: string;
  wordTimes?: LyricWord[];
  activeTime?: number;
  onWord?: (surface: string, entry: WordbookWord) => void;
}) {
  let ordinal = -1;
  const targetKey = target?.toLowerCase();
  const parts = text.split(/(\s+)/);
  // 短语动词（give up / look after）在歌词里是两个 token，高亮要连起来；
  // 连字符词（hard-working）本来就是同一个 token，走原来的单 token 路径。
  const targetWords = targetKey ? targetKey.split(/\s+/).filter(Boolean) : [];
  // 歌词里的词常带标点（running, / up,），比较时先剥掉首尾非字母。
  const bare = (value: string) => value.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');
  const targetOrdinals = new Set<number>();
  if (targetWords.length > 1) {
    const words = parts.filter((part) => part && !/^\s+$/.test(part));
    for (let start = 0; start + targetWords.length <= words.length; start += 1) {
      let hit = true;
      for (let k = 0; k < targetWords.length; k += 1) {
        if (bare(words[start + k]) !== targetWords[k]) {
          hit = false;
          break;
        }
      }
      if (hit) {
        for (let k = 0; k < targetWords.length; k += 1) targetOrdinals.add(start + k);
        break;
      }
    }
  }
  const isTargetAt = (at: number, token: string) =>
    targetWords.length > 1
      ? targetOrdinals.has(at)
      : Boolean(targetKey) && bare(token) === targetKey;
  return (
    <>
      {parts.map((token, index) => {
        if (!token) return null;
        const space = /^\s+$/.test(token);
        if (!space) ordinal += 1;
        const phase =
          !space && activeTime !== undefined ? wordPhase(wordTimes?.[ordinal], activeTime) : null;
        const phaseClass = phase ? `is-${phase}` : '';
        const key = token.toLowerCase();
        const entry = entries?.get(key);
        if (!entry) {
          if (!space && isTargetAt(ordinal, token)) {
            return (
              <span
                className={`word-token is-target ${phaseClass}`}
                data-target="true"
                data-text={token}
                key={index}
              >
                {token}
              </span>
            );
          }
          return phase ? (
            <span className={`word-token ${phaseClass}`} data-text={token} key={index}>
              {token}
            </span>
          ) : (
            <span key={index}>{token}</span>
          );
        }
        return (
          <span
            className={`word-token is-target ${focusKey === key ? 'is-focus' : ''} ${phaseClass}`}
            data-target="true"
            data-text={token}
            data-focus={focusKey === key ? 'true' : undefined}
            key={index}
            role={onWord ? 'button' : undefined}
            tabIndex={onWord ? 0 : undefined}
            title={`${entry.w} · ${entry.m}`}
            onClick={
              onWord
                ? (event) => {
                    event.stopPropagation();
                    onWord(token, entry);
                  }
                : undefined
            }
            onKeyDown={
              onWord
                ? (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    onWord(token, entry);
                  }
                : undefined
            }
          >
            {token}
            {focusKey === key ? (
              <>
                {' '}
                <span className="word-token-note">
                  <b>{entry.p}</b> {entry.m}
                </span>
              </>
            ) : null}
          </span>
        );
      })}
    </>
  );
}
