import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Loader2, LogOut, RefreshCw, ShieldCheck, Smartphone, X } from 'lucide-react';
import { api } from '@/api';
import { player } from '@/player';
import { usePlayerStore } from '@/store';

type Phase = 'loading' | 'ready' | 'scanned' | 'success' | 'expired' | 'error';

export function QQLoginModal() {
  const open = usePlayerStore((state) => state.drawer === 'qq-login');
  const qqAuth = usePlayerStore((state) => state.qqAuth);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [qr, setQr] = useState<{ key: string; image: string } | null>(null);
  const [nonce, setNonce] = useState(0);
  const close = () => usePlayerStore.getState().openDrawer(null);

  useEffect(() => {
    if (!open || qqAuth?.loggedIn) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = (key: string) => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        try {
          const result = await api.qq.qrCheck(key);
          if (cancelled) return;
          if (result.code === 803) {
            const status = await api.qq.authStatus();
            if (cancelled) return;
            usePlayerStore.getState().setQQAuth(status);
            usePlayerStore.getState().pushToast('QQ 音乐登录成功', 'success');
            const current = usePlayerStore.getState().song;
            if (current?.platform === 'qq') {
              void player.loadSong(current, { autoplay: false });
            }
            setPhase('success');
            timer = window.setTimeout(() => {
              if (!cancelled) close();
            }, 700);
            return;
          }
          if (result.code === 802) setPhase('scanned');
          if (result.code === 800) {
            setPhase('expired');
            return;
          }
          poll(key);
        } catch {
          if (!cancelled) poll(key);
        }
      }, 1600);
    };

    const begin = async () => {
      setPhase('loading');
      setError('');
      try {
        const result = await api.qq.qrKey();
        if (cancelled) return;
        setQr({ key: result.key, image: result.image });
        setPhase('ready');
        poll(result.key);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'QQ 二维码生成失败');
          setPhase('error');
        }
      }
    };

    void begin();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, qqAuth?.loggedIn, nonce]);

  const logout = async () => {
    await api.qq.logout();
    const status = await api.qq.authStatus();
    usePlayerStore.getState().setQQAuth(status);
    usePlayerStore.getState().pushToast('已退出 QQ 音乐', 'info');
    close();
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <div className="modal-layer">
            <motion.div
              className="login-modal"
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              role="dialog"
              aria-modal="true"
              aria-label="QQ 音乐登录"
            >
              <button type="button" className="modal-close icon-button" onClick={close} aria-label="关闭">
                <X size={17} />
              </button>

              {qqAuth?.loggedIn && qqAuth.profile ? (
                <div className="account-view">
                  <p className="drawer-kicker">QQ MUSIC CONNECTED</p>
                  <h2>QQ 音乐已连接</h2>
                  <div className="account-card">
                    <span className="account-avatar">
                      {qqAuth.profile.avatarUrl ? (
                        <img src={qqAuth.profile.avatarUrl} alt="" />
                      ) : (
                        qqAuth.profile.nickname.slice(0, 1)
                      )}
                    </span>
                    <span>
                      <strong>{qqAuth.profile.nickname}</strong>
                      <small>QQ 音乐账号 · 登录状态仅存本机</small>
                    </span>
                    <span className="account-ok">
                      <Check size={14} />
                      已连接
                    </span>
                  </div>
                  <button type="button" className="ghost-button danger" onClick={() => void logout()}>
                    <LogOut size={15} />
                    退出 QQ 音乐
                  </button>
                </div>
              ) : (
                <>
                  <header className="login-head">
                    <p className="drawer-kicker">CONNECT QQ MUSIC</p>
                    <h2>扫码登录 QQ 音乐</h2>
                    <p>用手机 QQ 扫码；登录后，会员曲才会返回播放地址。</p>
                  </header>

                  <div className={`qr-frame ${phase === 'scanned' ? 'is-scanned' : ''}`}>
                    {qr && (phase === 'ready' || phase === 'scanned') ? (
                      <img src={qr.image} alt="QQ 音乐登录二维码" />
                    ) : phase === 'success' ? (
                      <span className="qr-success">
                        <Check size={34} />
                      </span>
                    ) : phase === 'expired' ? (
                      <button type="button" className="qr-retry" onClick={() => setNonce((value) => value + 1)}>
                        <RefreshCw size={22} />
                        二维码过期，点此刷新
                      </button>
                    ) : phase === 'error' ? (
                      <button type="button" className="qr-retry" onClick={() => setNonce((value) => value + 1)}>
                        <RefreshCw size={22} />
                        生成失败，点此重试
                      </button>
                    ) : (
                      <span className="qr-loading">
                        <Loader2 className="spin" size={26} />
                        正在生成二维码
                      </span>
                    )}
                    <span className="qr-corner tl" />
                    <span className="qr-corner tr" />
                    <span className="qr-corner bl" />
                    <span className="qr-corner br" />
                  </div>

                  <div className="login-status">
                    {phase === 'scanned' ? (
                      <>
                        <Smartphone size={15} />
                        已扫码，在手机上确认
                      </>
                    ) : phase === 'success' ? (
                      <>
                        <Check size={15} />
                        登录成功，正在同步
                      </>
                    ) : phase === 'expired' ? (
                      '二维码已过期'
                    ) : phase === 'error' ? (
                      error
                    ) : (
                      <>
                        <span className="pulse-dot" />
                        打开手机 QQ，扫一扫
                      </>
                    )}
                  </div>

                  <p className="login-note">
                    <ShieldCheck size={14} />
                    QQ 登录凭证只保存在本机服务；QQ 音乐接口是非官方社区接口，商用前单独评估。
                  </p>
                </>
              )}
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
