import { ChevronLeft, Minus, Plus } from 'lucide-react';
import { MAX_NEW_PER_DAY, MAX_REVIEW_PER_DAY } from '@/lib/srs';
import { useStudyStore } from '@/studyStore';

const NEW_STEP = 5;
const REVIEW_STEP = 50;
const NEW_PRESETS = [10, 20, 30, 50, 100];
const REVIEW_PRESETS = [0, 100, 200, 300, 500];

function Stepper({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="settings-stepper" role="group" aria-label={label}>
        <button
          type="button"
          className="icon-action"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label={`减少${label}`}
        >
          <Minus size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <b>{display}</b>
        <button
          type="button"
          className="icon-action"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label={`增加${label}`}
        >
          <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Presets({
  label,
  values,
  current,
  onPick,
}: {
  label: string;
  values: number[];
  current: number;
  onPick: (value: number) => void;
}) {
  return (
    <div className="settings-presets" role="group" aria-label={label}>
      {values.map((value) => (
        <button
          type="button"
          key={value}
          className={`settings-chip ${value === current ? 'is-current' : ''}`}
          onClick={() => onPick(value)}
          aria-pressed={value === current}
        >
          {value === 0 ? '不限' : value}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const newPerDay = useStudyStore((store) => store.state.settings.newPerDay);
  const reviewPerDay = useStudyStore((store) => store.state.settings.reviewPerDay);
  const setNewPerDay = useStudyStore((store) => store.setNewPerDay);
  const setReviewPerDay = useStudyStore((store) => store.setReviewPerDay);

  return (
    <div className="settings-page">
      <header className="page-head">
        <button type="button" className="icon-action" onClick={onBack} aria-label="返回">
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <span className="page-title">设置</span>
      </header>

      <section className="settings-section" aria-labelledby="study-settings-title">
        <h2 className="settings-heading" id="study-settings-title">
          学习设置
        </h2>

        <Stepper
          label="每日新词"
          value={newPerDay}
          display={String(newPerDay)}
          min={5}
          max={MAX_NEW_PER_DAY}
          step={NEW_STEP}
          onChange={setNewPerDay}
        />
        <Presets
          label="每日新词预设"
          values={NEW_PRESETS}
          current={newPerDay}
          onPick={setNewPerDay}
        />
        <p className="settings-hint">
          新词越多，后面到期的复习越多。建议先从每天 10–20 个开始。
        </p>

        <div className="settings-divider" />

        <Stepper
          label="每日复习上限"
          value={reviewPerDay}
          display={reviewPerDay === 0 ? '不限' : String(reviewPerDay)}
          min={0}
          max={MAX_REVIEW_PER_DAY}
          step={REVIEW_STEP}
          onChange={setReviewPerDay}
        />
        <Presets
          label="每日复习上限预设"
          values={REVIEW_PRESETS}
          current={reviewPerDay}
          onPick={setReviewPerDay}
        />
        <p className="settings-hint">
          到期复习超过上限时，剩下的明天继续；不会丢。
        </p>
      </section>
    </div>
  );
}
