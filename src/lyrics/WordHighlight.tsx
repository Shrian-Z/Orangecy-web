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
  return (
    <>
      {text.split(/(\s+)/).map((token, index) => {
        if (!token) return null;
        const space = /^\s+$/.test(token);
        if (!space) ordinal += 1;
        const phase =
          !space && activeTime !== undefined ? wordPhase(wordTimes?.[ordinal], activeTime) : null;
        const phaseClass = phase ? `is-${phase}` : '';
        const key = token.toLowerCase();
        const entry = entries?.get(key);
        if (!entry) {
          if (!space && targetKey && key === targetKey) {
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
