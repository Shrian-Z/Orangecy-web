import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  FileUp,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react';
import {
  importedBookId,
  loadGaokaoWordbook,
  parseWordbook,
  type ImportMode,
  type ImportedBookMeta,
} from '@/lib/importDeck';
import { importWordbook, type ImportPhase, type ImportProgress } from '@/lib/wordImport';

type Phase = 'choose' | 'loading-preset' | 'working' | 'done' | 'error';

const PHASE_LABEL: Record<ImportPhase, string> = {
  playlists: '歌单',
  tracks: '曲目',
  lyrics: '歌词',
  playback: '试听',
  build: '成卡',
  done: '完成',
};

const PRESET_COUNT = 3738;

function fileBookName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

export function ImportSheet({
  open,
  onClose,
  onImported,
  onUseBook,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (book: ImportedBookMeta) => void;
  onUseBook: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [mode, setMode] = useState<ImportMode>('words');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportedBookMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('choose');
    setMode('words');
    setText('');
    setFileName('');
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    onClose();
  }, [onClose]);

  const runImport = useCallback(
    async (
      words: Parameters<typeof importWordbook>[0]['words'],
      name: string,
      source: string,
      id: string,
      tagline: string,
      nextMode: ImportMode,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase('working');
      setResult(null);
      setError(null);
      setProgress({ phase: nextMode === 'words' ? 'build' : 'playlists', done: 0, total: 1 });
      try {
        const meta = await importWordbook({
          id,
          name,
          tagline,
          source,
          words,
          mode: nextMode,
          signal: controller.signal,
          onProgress: setProgress,
        });
        if (controller.signal.aborted) return;
        setResult(meta);
        setPhase('done');
        onImported(meta);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        console.warn('[import] 导入失败', reason);
        setError(reason instanceof Error ? reason.message : '导入失败');
        setPhase('error');
      }
    },
    [onImported],
  );

  const startPreset = useCallback(async () => {
    setPhase('loading-preset');
    setError(null);
    try {
      const book = await loadGaokaoWordbook();
      // The preset is the curated "listen while learning" book: it always
      // matches the user's own playlists. A plain wordbook uses the custom path.
      setMode('music');
      await runImport(
        book.words,
        book.name,
        `${book.source} · ${book.license}`,
        `import-${book.id}`,
        book.tagline,
        'music',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '词表加载失败');
      setPhase('error');
    }
  }, [runImport]);

  const fallbackName = useMemo(() => fileBookName(fileName), [fileName]);
  const parsed = useMemo(() => parseWordbook(text, fallbackName), [text, fallbackName]);

  const startCustom = useCallback(() => {
    if (!parsed?.words.length) return;
    const name =
      !fallbackName && parsed.name === '导入词书'
        ? `导入词表 ${parsed.words.length}`
        : parsed.name;
    const source =
      parsed.source && parsed.source !== '用户导入'
        ? parsed.source
        : fileName
          ? `用户文件 · ${fileName}`
          : '用户粘贴';
    void runImport(parsed.words, name, source, importedBookId(), parsed.tagline, mode);
  }, [parsed, fallbackName, fileName, mode, runImport]);

  const onFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      setFileName(file.name);
      setText(raw);
    } catch (reason) {
      console.warn('[import] 文件读取失败', reason);
      setError('文件读取失败');
      setPhase('error');
    }
  }, []);

  if (!open) return null;

  const percent =
    progress && progress.total > 0
      ? Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100)))
      : 0;
  const words = parsed?.words ?? [];
  const hasInput = Boolean(text.trim());
  const previewName =
    parsed && !fallbackName && parsed.name === '导入词书'
      ? `导入词表 ${words.length}`
      : (parsed?.name ?? '');

  return (
    <div className="sheet-scrim" role="presentation" onClick={close}>
      <div
        className="import-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="导入词书"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-nav">
          <span className="import-title">
            <FileUp size={18} strokeWidth={1.8} aria-hidden="true" />
            导入词书
          </span>
          <button type="button" className="icon-action" onClick={close} aria-label="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {phase === 'choose' ? (
          <>
            <button type="button" className="import-preset" onClick={() => void startPreset()}>
              <span className="import-preset-icon" aria-hidden="true">
                <BookOpen size={22} strokeWidth={1.8} />
              </span>
              <span className="import-preset-main">
                <span className="import-preset-name">高考 3500</span>
                <span className="import-preset-tag">3500 词扩展版 · 歌单配歌</span>
              </span>
              <span className="import-preset-count">{PRESET_COUNT}</span>
              <ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>

            <textarea
              className="import-input"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (fileName) setFileName('');
              }}
              placeholder="粘贴词表，或选文件；每行一个单词，或 word,音标,释义"
              aria-label="词书内容"
              spellCheck={false}
            />

            {parsed && words.length ? (
              <div className="import-preview">
                <div className="import-preview-head">
                  <BookOpen size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span className="import-preview-name">{previewName}</span>
                  <span className="import-preview-count">{words.length} 词</span>
                </div>
                <p className="import-preview-sample">
                  {words
                    .slice(0, 4)
                    .map((word) => word.w)
                    .join(' · ')}
                  {words.length > 4 ? ' …' : ''}
                </p>
              </div>
            ) : null}

            {hasInput && !words.length ? (
              <p className="import-empty">没有识别到单词</p>
            ) : null}

            <div className="import-mode" role="group" aria-label="导入方式">
              <button
                type="button"
                className={`import-mode-option ${mode === 'words' ? 'is-current' : ''}`}
                aria-pressed={mode === 'words'}
                onClick={() => setMode('words')}
              >
                仅词书
              </button>
              <button
                type="button"
                className={`import-mode-option ${mode === 'music' ? 'is-current' : ''}`}
                aria-pressed={mode === 'music'}
                onClick={() => setMode('music')}
              >
                配歌
              </button>
            </div>
            <p className="import-hint">
              {mode === 'words'
                ? '纯词卡：翻面后只读发音，不配歌词片段'
                : '从已连接平台的歌单里找歌词，给每个词配一句歌；可能需要几分钟'}
            </p>

            <div className="import-actions">
              <button
                type="button"
                className="import-file"
                onClick={() => fileRef.current?.click()}
                aria-label="选择词书文件"
              >
                <Paperclip size={16} strokeWidth={1.8} aria-hidden="true" />
                文件
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.csv,.tsv,.json,text/plain,text/csv,application/json"
                onChange={(event) => void onFile(event)}
                hidden
              />
              <button
                type="button"
                className="solid import-go"
                disabled={!words.length}
                onClick={startCustom}
              >
                {words.length ? `导入 ${words.length}` : '导入'}
              </button>
            </div>
          </>
        ) : null}

        {phase === 'loading-preset' ? (
          <div className="import-progress">
            <div className="import-progress-head">
              <Loader2 className="platform-spin" size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>词表</span>
            </div>
          </div>
        ) : null}

        {phase === 'working' && progress ? (
          <div className="import-progress">
            <div className="import-progress-head">
              <Loader2 className="platform-spin" size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{PHASE_LABEL[progress.phase]}</span>
              <b>
                {progress.done} / {progress.total}
              </b>
            </div>
            <div className="import-bar" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}

        {phase === 'done' && result ? (
          <div className="import-done">
            <span className="import-done-icon" aria-hidden="true">
              <Check size={26} strokeWidth={1.8} />
            </span>
            <p className="import-done-name">{result.name}</p>
            {result.mode === 'words' ? (
              <>
                <p className="import-summary">
                  <b>{result.stats.words}</b> 词 · 纯词卡
                </p>
                <p className="import-sub">已存到本机 · 发音可用，不含歌词片段</p>
              </>
            ) : (
              <>
                <p className="import-summary">
                  <b>{result.stats.words}</b> 词 · <b>{result.stats.matchedWords}</b> 配歌 ·{' '}
                  <b>{result.stats.trackCount}</b> 曲
                </p>
                <p className="import-sub">
                  {result.stats.tracksScanned} 曲扫描 · {result.stats.tracksWithLyrics} 首带歌词
                </p>
              </>
            )}
            <button type="button" className="solid import-use" onClick={onUseBook}>
              用这本书
            </button>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="import-done">
            <p className="import-summary">{error ?? '导入失败'}</p>
            <button type="button" className="solid import-use" onClick={reset}>
              返回
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
