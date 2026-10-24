import { WordSpans } from '@/lyrics/WordHighlight';
import type { FocusFragment } from '@/cards';

export function LyricFragment({
  fragment,
  activeLine,
  playing,
  onReplay,
}: {
  fragment: FocusFragment;
  activeLine: number;
  playing: boolean;
  onReplay: () => void;
}) {
  return (
    <section
      className="lyrics"
      aria-label="歌词片段"
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onReplay();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onReplay();
      }}
    >
      {fragment.lines.map((line, index) => {
        const state = playing
          ? index === activeLine
            ? 'is-active'
            : index === activeLine + 1
              ? 'is-next'
              : 'is-past'
          : index === activeLine
            ? 'is-active'
            : index < activeLine
              ? 'is-past'
              : '';
        return (
          <p className={`line ${state}`} key={`${line.time}-${index}`}>
            <WordSpans text={line.text} target={fragment.target} />
          </p>
        );
      })}
    </section>
  );
}
