import { useEffect, useState } from 'react';
import { Check, ChevronLeft, Loader2, RefreshCw, X } from 'lucide-react';
import { PLATFORMS, PLATFORM_BY_ID } from '@/platforms';
import type { PlatformId, PlatformQrKey } from '@/platforms';

type Phase = 'loading' | 'ready' | 'scanned' | 'success' | 'expired' | 'error';

export function PlatformConnectSheet({
  open,
  connected,
  onClose,
  onConnected,
}: {
  open: boolean;
  connected: Record<PlatformId, boolean>;
  onClose: () => void;
  onConnected: (platform: PlatformId) => void;
}) {
  const [selected, setSelected] = useState<PlatformId | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [qr, setQr] = useState<PlatformQrKey | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setPhase('loading');
      setQr(null);
      setNonce(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !selected) return;
    const config = PLATFORM_BY_ID.get(selected);
    if (!config) return;
    let cancelled = false;
    let timer = 0;

    const poll = (key: string) => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        try {
          const result = await config.qrCheck(key);
          if (cancelled) return;
          if (result.code === 803) {
            const auth = await config.authStatus();
            if (cancelled) return;
            if (auth.loggedIn) {
              onConnected(config.id);
              setPhase('success');
              timer = window.setTimeout(() => {
                if (!cancelled) onClose();
              }, 700);
              return;
            }
          }
          if (result.code === 802) setPhase('scanned');
          if (result.code === 800) {
            setPhase('expired');
            return;
          }
          poll(key);
        } catch (error) {
          if (cancelled) return;
          console.warn('[platform] qr check failed', error);
          setPhase('error');
        }
      }, 1500);
    };

    const begin = async () => {
      setPhase('loading');
      setQr(null);
      try {
        const result = await config.qrKey();
        if (cancelled) return;
        setQr(result);
        setPhase('ready');
        poll(result.key);
      } catch (error) {
        if (cancelled) return;
        console.warn('[platform] qr key failed', error);
        setPhase('error');
      }
    };

    void begin();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, selected, nonce, onConnected, onClose]);

  if (!open) return null;

  const platform = selected ? PLATFORM_BY_ID.get(selected) : null;
  const Icon = platform?.Icon;

  return (
    <div className="sheet-scrim" role="presentation" onClick={onClose}>
      <div
        className="platform-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="添加音源"
        onClick={(event) => event.stopPropagation()}
      >
        {platform && Icon ? (
          <>
            <div className="sheet-nav">
              <button
                type="button"
                className="icon-action"
                onClick={() => setSelected(null)}
                aria-label="返回平台列表"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button type="button" className="icon-action" onClick={onClose} aria-label="关闭">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="qr-panel">
              <span className="qr-platform">
                <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className={`qr-frame ${phase === 'scanned' ? 'is-scanned' : ''}`}>
                {phase === 'success' ? (
                  <Check className="qr-success" size={36} strokeWidth={1.6} aria-hidden="true" />
                ) : phase === 'expired' || phase === 'error' ? (
                  <button
                    type="button"
                    className="qr-retry"
                    onClick={() => setNonce((value) => value + 1)}
                    aria-label="刷新二维码"
                  >
                    <RefreshCw size={22} aria-hidden="true" />
                  </button>
                ) : qr ? (
                  <img className="qr-image" src={qr.image} alt="" />
                ) : (
                  <Loader2 className="platform-spin" size={26} aria-hidden="true" />
                )}
                {phase === 'scanned' ? (
                  <span className="qr-badge">
                    <Check size={14} strokeWidth={2} aria-hidden="true" />
                  </span>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="sheet-nav">
              <span />
              <button type="button" className="icon-action" onClick={onClose} aria-label="关闭">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="platform-grid">
              {PLATFORMS.map((item) => {
                const ItemIcon = item.Icon;
                const isConnected = connected[item.id];
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`platform-choice ${isConnected ? 'is-connected' : ''}`}
                    onClick={() => setSelected(item.id)}
                    disabled={isConnected}
                    aria-label={isConnected ? `${item.label}已连接` : `连接${item.label}`}
                    title={item.label}
                  >
                    <ItemIcon size={26} strokeWidth={1.8} aria-hidden="true" />
                    {isConnected ? (
                      <span className="platform-check">
                        <Check size={12} strokeWidth={2} aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
