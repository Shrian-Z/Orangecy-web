import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Loader2, LogIn, LogOut, X } from 'lucide-react';
import { api } from '@/api';
import { usePlayerStore } from '@/store';
import type { AuthStatus } from '@/types';

type PlatformKey = 'netease' | 'qq' | 'kugou' | 'bodian';

interface Row {
  key: PlatformKey;
  name: string;
  initial: string;
  auth: AuthStatus | null;
  loginDrawer: 'login' | 'qq-login' | 'kugou-login' | 'bodian-login';
  note: string;
}

export function PlatformDrawer() {
  const open = usePlayerStore((state) => state.drawer === 'platforms');
  const auth = usePlayerStore((state) => state.auth);
  const qqAuth = usePlayerStore((state) => state.qqAuth);
  const kugouAuth = usePlayerStore((state) => state.kugouAuth);
  const bodianAuth = usePlayerStore((state) => state.bodianAuth);
  const reduceMotion = usePlayerStore((state) => state.reduceMotion);
  const setReduceMotion = usePlayerStore((state) => state.setReduceMotion);
  const setAuth = usePlayerStore((state) => state.setAuth);
  const setQQAuth = usePlayerStore((state) => state.setQQAuth);
  const setKugouAuth = usePlayerStore((state) => state.setKugouAuth);
  const setBodianAuth = usePlayerStore((state) => state.setBodianAuth);
  const openDrawer = usePlayerStore((state) => state.openDrawer);
  const pushToast = usePlayerStore((state) => state.pushToast);
  const [pending, setPending] = useState<PlatformKey | null>(null);
  const close = () => openDrawer(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refresh = async () => {
      const results = await Promise.allSettled([
        api.authStatus(),
        api.qq.authStatus(),
        api.kugou.authStatus(),
        api.bodian.authStatus(),
      ]);
      if (cancelled) return;
      const [netease, qq, kugou, bodian] = results;
      if (netease.status === 'fulfilled') setAuth(netease.value);
      if (qq.status === 'fulfilled') setQQAuth(qq.value);
      if (kugou.status === 'fulfilled') setKugouAuth(kugou.value);
      if (bodian.status === 'fulfilled') setBodianAuth(bodian.value);
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [open, setAuth, setQQAuth, setKugouAuth, setBodianAuth]);

  const rows: Row[] = [
    {
      key: 'netease',
      name: '网易云音乐',
      initial: '网',
      auth,
      loginDrawer: 'login',
      note: '主力曲库；扫码后可播账号内更多曲目。',
    },
    {
      key: 'qq',
      name: 'QQ 音乐',
      initial: 'Q',
      auth: qqAuth,
      loginDrawer: 'qq-login',
      note: '免费曲可直接播；会员曲需要扫码登录。',
    },
    {
      key: 'kugou',
      name: '酷狗音乐',
      initial: '酷',
      auth: kugouAuth,
      loginDrawer: 'kugou-login',
      note: '免费曲可直接播；登录后尝试会员曲。',
    },
    {
      key: 'bodian',
      name: '波点音乐',
      initial: '波',
      auth: bodianAuth,
      loginDrawer: 'bodian-login',
      note: '播放需要登录，且仅限中国大陆网络。',
    },
  ];

  const logout = async (key: PlatformKey) => {
    setPending(key);
    try {
      if (key === 'netease') {
        await api.logout();
        setAuth(await api.authStatus());
      } else if (key === 'qq') {
        await api.qq.logout();
        setQQAuth(await api.qq.authStatus());
      } else if (key === 'kugou') {
        await api.kugou.logout();
        setKugouAuth(await api.kugou.authStatus());
      } else {
        await api.bodian.logout();
        setBodianAuth(await api.bodian.authStatus());
      }
      pushToast('已退出平台账号', 'info');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '退出失败', 'error');
    } finally {
      setPending(null);
    }
  };

  const loggedCount = rows.filter((row) => row.auth?.loggedIn).length;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
          />
          <motion.aside
            className="search-drawer platform-drawer"
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            role="dialog"
            aria-label="平台账号"
          >
            <header className="drawer-head">
              <div>
                <p className="drawer-kicker">PLATFORMS</p>
                <h2>平台账号</h2>
              </div>
              <button type="button" className="icon-button" onClick={close} aria-label="关闭">
                <X size={17} />
              </button>
            </header>

            <div className="platform-summary">
              <span className="status-dot is-live" />
              四个平台已接入
              <em>{loggedCount} / 4 已登录</em>
            </div>

            <div className="platform-list">
              {rows.map((row) => {
                const profile = row.auth?.profile;
                const loggedIn = Boolean(row.auth?.loggedIn);
                return (
                  <div className={`platform-row is-${row.key}`} key={row.key}>
                    <span className="platform-badge">
                      {profile?.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="" />
                      ) : (
                        profile?.nickname.slice(0, 1) || row.initial
                      )}
                    </span>
                    <span className="platform-row-copy">
                      <span className="platform-row-title">
                        <strong>{row.name}</strong>
                        {loggedIn ? (
                          <i className="platform-connected">
                            <Check size={10} />
                            已连接
                          </i>
                        ) : null}
                      </span>
                      <small>
                        {loggedIn && profile
                          ? `${profile.nickname} · ${row.note}`
                          : row.note}
                      </small>
                    </span>
                    {loggedIn ? (
                      <button
                        type="button"
                        className="platform-action is-out"
                        onClick={() => void logout(row.key)}
                        disabled={pending === row.key}
                        aria-label={`退出${row.name}`}
                      >
                        {pending === row.key ? (
                          <Loader2 className="spin" size={13} />
                        ) : (
                          <LogOut size={13} />
                        )}
                        退出
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="platform-action"
                        onClick={() => openDrawer(row.loginDrawer)}
                      >
                        <LogIn size={13} />
                        登录
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="platform-settings">
              <button
                type="button"
                className={`autoplay-toggle ${reduceMotion ? 'is-on' : ''}`}
                onClick={() => setReduceMotion(!reduceMotion)}
                aria-pressed={reduceMotion}
              >
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                减少动态效果
                <em>{reduceMotion ? '开' : '关'}</em>
              </button>
              <p>系统开启“减少动态效果”时自动生效；这里可以手动锁定，老设备会更稳。</p>
              <button
                type="button"
                className="platform-dev-link"
                onClick={() => openDrawer('check')}
              >
                开发者自检 · M1 接入检查
              </button>
            </div>

            <footer className="drawer-foot">
              <span className="status-dot is-live" />
              账号只存本机服务
              <em>换浏览器需重新登录</em>
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
