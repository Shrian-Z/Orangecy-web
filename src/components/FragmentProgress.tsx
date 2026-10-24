export function FragmentProgress({
  progress,
  playing,
}: {
  progress: number;
  playing: boolean;
}) {
  const percent = Math.max(0, Math.min(100, progress * 100));
  return (
    <div className={`progress ${playing ? 'is-playing' : ''}`} aria-hidden="true">
      <span style={{ width: `${percent.toFixed(1)}%` }} />
    </div>
  );
}
