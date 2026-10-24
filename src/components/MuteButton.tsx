import { Volume2, VolumeX } from 'lucide-react';

export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`mute ${muted ? 'is-muted' : ''}`}
      data-muted={muted}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-label={muted ? '取消静音' : '静音'}
      aria-pressed={muted}
    >
      {muted ? (
        <VolumeX size={20} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Volume2 size={20} strokeWidth={1.8} aria-hidden="true" />
      )}
    </button>
  );
}
