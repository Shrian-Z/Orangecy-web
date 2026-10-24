import { FragmentProgress } from '@/components/FragmentProgress';
import { LyricFragment } from '@/components/LyricFragment';
import type { FocusCardData } from '@/cards';
import type { SequencePhase } from '@/audio/sequence';

function Example({ value }: { value: string }) {
  const [text, translation] = value.split('||');
  return (
    <p className="example">
      {text}
      {translation ? <span>{translation}</span> : null}
    </p>
  );
}

export function FocusCard({
  card,
  expanded,
  phase,
  progress,
  activeLine,
  muted,
  busy,
  onToggle,
  onReplay,
  onSpeak,
  onRate,
}: {
  card: FocusCardData;
  expanded: boolean;
  phase: SequencePhase;
  progress: number;
  activeLine: number;
  muted: boolean;
  busy: boolean;
  onToggle: () => void;
  onReplay: () => void;
  onSpeak: () => void;
  onRate: (rating: 'hard' | 'good') => void;
}) {
  const playing = phase === 'fragment';

  return (
    <article
      className="focus-card"
      data-expanded={expanded}
      data-playing={playing}
      data-muted={muted}
      tabIndex={0}
      role="group"
      aria-label="学习卡片"
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onToggle();
      }}
    >
      <div className="card-body">
        <LyricFragment
          fragment={card.fragment}
          activeLine={activeLine}
          playing={playing}
          onReplay={onReplay}
        />
        <FragmentProgress progress={progress} playing={playing} />

        <section
          className="word-block"
          aria-label="单词"
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onSpeak();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            onSpeak();
          }}
        >
          <h1 className="word">{card.w}</h1>
          {card.p ? <p className="phonetic">/{card.p}/</p> : null}
        </section>

        <section className="meaning" aria-hidden={!expanded}>
          <div>
            <p className="sense">{card.m}</p>
            {card.k ? <p className="knowledge">{card.k}</p> : null}
            {card.s ? <Example value={card.s} /> : null}
          </div>
        </section>
      </div>

      <div className="actions" role="group" aria-label="判断" aria-hidden={!expanded}>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onRate('hard');
          }}
        >
          模糊
        </button>
        <button
          type="button"
          className="solid"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onRate('good');
          }}
        >
          认识
        </button>
      </div>
    </article>
  );
}
