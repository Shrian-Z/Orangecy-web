import type { WordbookWord } from '@/lib/wordbook';
import type { LyricWord } from '@/types';
import { wordPhase } from '@/lyrics/timing';

/**
 * Renders one lyric line as word tokens: whitespace is preserved, wordbook
 * entries are clickable targets, and word-level timestamps produce the
 * waiting / singing / sung phase classes.
 *
 * This is the word-highlight organ extracted verbatim from LyricsStage during
 * the ammo migration; the old stage keeps using it so its DOM stays unchanged.
 */
export function WordSpans({
  text,
  entries,
  focusKey,
  wordTimes,
  activeTime,
  onWord,
}: {
  text: string;
  entries?: Map<string, WordbookWord>;
  focusKey?: string;
  wordTimes?: LyricWord[];
  activeTime?: number;
  onWord: (surface: string, entry: WordbookWord) => void;
}) {
  let ordinal = -1;
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
          return phase ? (
            <span className={`lyric-word ${phaseClass}`} data-text={token} key={index}>
              {token}
            </span>
          ) : (
            <span key={index}>{token}</span>
          );
        }
        return (
          <span
            className={`lyric-word is-target ${focusKey === key ? 'is-focus' : ''} ${phaseClass}`}
            data-target="true"
            data-text={token}
            data-focus={focusKey === key ? 'true' : undefined}
            key={index}
            role="button"
            tabIndex={0}
            title={`${entry.w} · ${entry.m}`}
            onClick={(event) => {
              event.stopPropagation();
              onWord(token, entry);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onWord(token, entry);
            }}
          >
            {token}
            {focusKey === key ? (
              <>
                {' '}
                <span className="lyric-word-note">
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
