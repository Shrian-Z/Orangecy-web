import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ChevronRight,
  CircleDashed,
  LogIn,
  LogOut,
  Play,
  RotateCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '@/api';
import { player } from '@/player';
import { usePlayerStore } from '@/store';
import { formatTime } from '@/lib/lrc';
import { buildSongMatches } from '@/lib/wordbook';

export function CheckDrawer() {
  const open = usePlayerStore((state) => state.drawer === 'check');
  const auth = usePlayerStore((state) => state.auth);
  const lines = usePlayerStore((state) => state.lines);
  const seekCheck = usePlayerStore((state) => state.seekCheck);
  const song = usePlayerStore((state) => state.song);
  const playInfo = usePlayerStore((state) => state.playInfo);
  const playing = usePlayerStore((state) => state.playing);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const wordbook = usePlayerStore((state) => state.wordbook);
  const [running, setRunning] = useState(false);

  const matches = useMemo(
    () => (wordbook && lines.length ? buildSongMatches(lines, wordbook) : null),
    [wordbook, lines],
  );

  const close = () => usePlayerStore.getState().openDrawer(null);
  const openDrawer = usePlayerStore.getState().openDrawer;
  const toast = usePlayerStore.getState().pushToast;

  const checks = [Boolean(auth?.loggedIn), lines.length > 0, Boolean(seekCheck?.passed)];
  const passed = checks.filter(Boolean).length;
  const deltaMs = seekCheck ? Math.round(Math.abs(seekCheck.actual - seekCheck.requested) * 1000) : null;

  const runCheck = async () => {
    if (!lines.length) {
      toast('先选一首带时间戳歌词的歌', 'error');
      return;
    }
    const line = lines[Math.min(2, lines.length - 1)];
    setRunning(true);
    const check = await player.seekTo(line.time, { play: true });
    setRunning(false);
    if (check?.passed) {
      toast(
        `从 ${formatTime(line.time)} 起播，偏差 ${Math.round(Math.abs(check.actual - check.requested) * 1000)}ms`,
        'success',
      );
    } else {
      toast('没能从那一秒播起来，检查音源或浏览器自动播放限制', 'error');
    }
  };

  const logout = async () => {
    await api.logout();
    const status = await api.authStatus();
    usePlayerStore.getState().setAuth(status);
    toast('已退出网易云', 'info');
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
          <motion.aside
            className="check-drawer"
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            role="dialog"
            aria-label="平台接入检查"
          >
            <header className="drawer-head">
              <div>
                <p className="drawer-kicker">MILESTONE 01</p>
                <h2>平台验证</h2>
              </div>
              <button type="button" className="icon-button" onClick={close} aria-label="关闭">
                <X size={18} />
              </button>
            </header>

            <div className="check-hero">
              <span
                className="check-ring"
                style={{ '--score': `${(passed / 3) * 360}deg` } as React.CSSProperties}
              >
                <span>
                  {passed}
                  <i>/3</i>
                </span>
              </span>
              <div>
                <strong>{passed === 3 ? '平台验证通过' : '还差几步'}</strong>
                <p>网易云链路：登录 → 带时间戳歌词 → 从指定秒数播放</p>
              </div>
            </div>

            <div className="check-rows">
              <div className={`check-row ${checks[0] ? 'is-ok' : ''}`}>
                <span className="check-num">01</span>
                <div className="check-row-main">
                  <strong>网易云账号</strong>
                  <p>
                    {auth?.loggedIn && auth.profile
                      ? `${auth.profile.nickname} · 已连接网易云`
                      : '未登录 · 目前只能播放免费曲目'}
                  </p>
                  <div className="check-row-actions">
                    {auth?.loggedIn ? (
                      <button type="button" className="mini-button" onClick={() => void logout()}>
                        <LogOut size={13} />
                        退出
                      </button>
                    ) : (
                      <button type="button" className="mini-button" onClick={() => openDrawer('login')}>
                        <LogIn size={13} />
                        扫码登录
                      </button>
                    )}
                  </div>
                </div>
                <span className="check-state">
                  {checks[0] ? <Check size={15} /> : <CircleDashed size={15} />}
                  {checks[0] ? '通过' : '待完成'}
                </span>
              </div>

              <div className={`check-row ${checks[1] ? 'is-ok' : ''}`}>
                <span className="check-num">02</span>
                <div className="check-row-main">
                  <strong>带时间戳歌词</strong>
                  <p>
                    {lines.length
                      ? `LRC 时间轴 · ${lines.length} 行 · 首句 ${formatTime(lines[0].time)}`
                      : '还没有加载到带时间轴的歌词'}
                  </p>
                  <div className="check-row-actions">
                    <button type="button" className="mini-button" onClick={() => openDrawer('search')}>
                      <Search size={13} />
                      换一首
                    </button>
                  </div>
                </div>
                <span className="check-state">
                  {checks[1] ? <Check size={15} /> : <CircleDashed size={15} />}
                  {checks[1] ? '通过' : '待完成'}
                </span>
              </div>

              <div className={`check-row ${checks[2] ? 'is-ok' : ''}`}>
                <span className="check-num">03</span>
                <div className="check-row-main">
                  <strong>从指定秒数播放</strong>
                  <p>
                    {seekCheck
                      ? `请求 ${seekCheck.requested.toFixed(2)}s · 实际 ${seekCheck.actual.toFixed(2)}s · 偏差 ${deltaMs}ms`
                      : '点一句歌词，或点下面的按钮跑一次'}
                  </p>
                  <div className="check-row-actions">
                    <button
                      type="button"
                      className="mini-button warm"
                      onClick={() => void runCheck()}
                      disabled={running || !lines.length}
                    >
                      {running ? <RotateCw className="spin" size={13} /> : <Play size={13} fill="currentColor" />}
                      {running ? '正在验证' : '运行检查'}
                    </button>
                  </div>
                </div>
                <span className="check-state">
                  {checks[2] ? <Check size={15} /> : <CircleDashed size={15} />}
                  {checks[2] ? '通过' : '待完成'}
                </span>
              </div>
            </div>

            <div className="check-live">
              <p className="search-section-label">实时状态</p>
              <dl>
                <div>
                  <dt>当前曲目</dt>
                  <dd>{song ? `${song.title} · ${song.artistText}` : '未选歌'}</dd>
                </div>
                <div>
                  <dt>音源</dt>
                  <dd>
                    {playInfo
                      ? playInfo.available
                        ? `可播放 · ${playInfo.br ? `${Math.round(playInfo.br / 1000)}kbps` : '码率未知'}${playInfo.trial ? ' · 试听片段' : ''}`
                        : playInfo.reason ?? '不可播放'
                      : '待检测'}
                  </dd>
                </div>
                <div>
                  <dt>播放进度</dt>
                  <dd>
                    {formatTime(currentTime)} / {formatTime(duration)} · {playing ? '播放中' : '暂停'}
                  </dd>
                </div>
                <div>
                  <dt>歌词行数</dt>
                  <dd>{lines.length} 行</dd>
                </div>
                <div>
                  <dt>词书</dt>
                  <dd>
                    {wordbook
                      ? `${wordbook.name} · 命中 ${matches?.count ?? 0} 词`
                      : '还没选词书'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="check-note">
              <ShieldCheck size={15} />
              <p>
                三项全绿，即附录 F 第 1 步的网易云链路验收通过；QQ 音乐走搜索面板里的独立扫码。M2 播放器与时间戳歌词、M3 词书整词匹配已接上；下一步是词卡 +
                片段播放（M4），再上 ts-fsrs（M5）。
              </p>
            </div>

            <button type="button" className="check-next" onClick={() => openDrawer('search')}>
              选一首歌继续
              <ChevronRight size={16} />
            </button>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
