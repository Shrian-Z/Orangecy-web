import { RotateCcw } from 'lucide-react';
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Demo-only prompt. The same wordbook example is used in two ways:
 * - context: show the sentence with the target highlighted, meaning hidden;
 * - cloze: blank the target and show the translation as the cue.
 *
 * Lyrics still use LyricFragment; this component keeps the static demo free of
 * song/API dependencies while preserving one sentence + one target.
 */
function ExamplePrompt({
  value,
  target,
  blank,
}: {
  value: string;
  target: string;
  blank: boolean;
}) {
  const [text, translation] = value.split('||');
  const parts = text.split(new RegExp(`(${escapeRegExp(target)})`, 'gi'));
  const blankText = '_'.repeat(Math.max(3, Math.min(12, target.length)));

  return (
    <section className={`prompt ${blank ? 'is-cloze' : ''}`} aria-label="例句">
      <p className="prompt-line">
        {parts.map((part, index) =>
          index % 2 === 1 ? (
            blank ? (
              <span className="prompt-blank" key={index}>
                {blankText}
              </span>
            ) : (
              <span className="word-token is-target" key={index}>
                {part}
              </span>
            )
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      </p>
      {blank && translation ? <p className="prompt-translation">{translation}</p> : null}
    </section>
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
  demo = false,
  variant = 'recall',
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
  demo?: boolean;
  variant?: 'context' | 'recall' | 'cloze';
  onToggle: () => void;
  onReplay: () => void;
  onSpeak: () => void;
  onRate: (rating: 'again' | 'hard' | 'good') => void;
}) {
  const playing = phase === 'fragment';
  const fragment = card.fragment;
  const showPrompt = demo && variant !== 'recall' && Boolean(card.s);
  const hideWord = demo && variant === 'cloze' && !expanded;

  return (
    <article
      className="focus-card"
      data-expanded={expanded}
      data-playing={playing}
      data-muted={muted}
      data-plain={fragment ? undefined : 'true'}
      data-demo={demo ? 'true' : undefined}
      data-variant={demo ? variant : undefined}
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
        {fragment ? (
          <>
            <LyricFragment
              fragment={fragment}
              activeLine={activeLine}
              playing={playing}
              onReplay={onReplay}
            />
            <FragmentProgress progress={progress} playing={playing} />
          </>
        ) : null}

        {showPrompt && card.s ? (
          <ExamplePrompt
            value={card.s}
            target={card.w}
            blank={variant === 'cloze'}
          />
        ) : null}

        {hideWord ? null : (
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
        )}

        <section className="meaning" aria-hidden={!expanded}>
          <div>
            <p className="sense">{card.m}</p>
            {card.k ? <p className="knowledge">{card.k}</p> : null}
            {card.s && !(demo && variant === 'context') ? <Example value={card.s} /> : null}
          </div>
        </section>
      </div>

      <div className="actions" role="group" aria-label="判断" aria-hidden={!expanded}>
        {demo ? (
          <button
            type="button"
            className="ghost action-again"
            disabled={busy}
            aria-label="忘记"
            title="忘记"
            onClick={(event) => {
              event.stopPropagation();
              onRate('again');
            }}
          >
            <RotateCcw size={19} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : null}
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
