import { api } from '@/api';
import { parseLyric } from '@/lyrics/parse';
import { usePlayerStore } from '@/audio/store';
import type { LyricLine, Song } from '@/types';

let audio: HTMLAudioElement | null = null;
let loadToken = 0;
let lastErrorKey = '';
let wired = false;

function getAudio() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
  }
  return audio;
}

function toast(text: string, tone: 'info' | 'success' | 'error' = 'info') {
  usePlayerStore.getState().pushToast(text, tone);
}

export const player = {
  boot() {
    const el = getAudio();
    if (wired) return;
    wired = true;

    let saved = 0.85;
    try {
      const raw = localStorage.getItem('orangecy.volume');
      if (raw !== null) saved = Number(raw);
    } catch {
      // 隐私模式无本地存储
    }
    if (Number.isFinite(saved)) {
      el.volume = Math.max(0, Math.min(1, saved));
      usePlayerStore.getState().setVolume(el.volume);
    }

    el.addEventListener('timeupdate', () => {
      usePlayerStore.getState().setTime(el.currentTime, el.duration);
    });
    el.addEventListener('durationchange', () => {
      if (Number.isFinite(el.duration)) usePlayerStore.getState().setDuration(el.duration);
    });
    el.addEventListener('loadedmetadata', () => {
      usePlayerStore.getState().setAudioReady(true);
      if (Number.isFinite(el.duration)) {
        usePlayerStore.getState().setTime(el.currentTime, el.duration);
      }
    });
    el.addEventListener('canplay', () => usePlayerStore.getState().setAudioReady(true));
    el.addEventListener('play', () => usePlayerStore.getState().setPlaying(true));
    el.addEventListener('pause', () => usePlayerStore.getState().setPlaying(false));
    el.addEventListener('ended', () => {
      usePlayerStore.getState().setPlaying(false);
      const { queue, queueIndex } = usePlayerStore.getState();
      if (queue.length > 1 && queueIndex >= 0) {
        void player.next();
      }
    });
    el.addEventListener('error', () => {
      const { song, playInfo } = usePlayerStore.getState();
      if (!song || !el.src) return;
      if (playInfo && !playInfo.available) return;
      const key = `${song.id}:${el.error?.code ?? 'x'}`;
      if (key === lastErrorKey) return;
      lastErrorKey = key;
      usePlayerStore.getState().setPlaying(false);
      toast(
        el.error?.code === 4
          ? '这个音源暂时播不了，换一首试试'
          : '播放中断了，检查一下网络',
        'error',
      );
    });
  },

  async loadSong(song: Song, options: { autoplay?: boolean } = {}) {
    player.boot();
    const el = getAudio();
    const token = ++loadToken;
    const store = usePlayerStore.getState();

    store.beginLoad(song);
    el.pause();
    const isQQ = song.platform === 'qq';
    const isKugou = song.platform === 'kugou';
    const isBodian = song.platform === 'bodian';
    const isExternal = isQQ || isKugou || isBodian;
    const lyricRequest = () =>
      isQQ
        ? api.qq.lyric(song.id)
        : isKugou
          ? api.kugou.lyric(song)
          : isBodian
            ? api.bodian.lyric(song)
            : api.lyric(song.id);
    const playRequest = () =>
      isQQ
        ? api.qq.play(song.id)
        : isKugou
          ? api.kugou.play(song)
          : isBodian
            ? api.bodian.play(song)
            : api.play(song.id);
    const kugouMeta = song.meta ?? {};
    const kugouQuery = new URLSearchParams({
      albumId: kugouMeta.albumId ?? '',
      mixSongId: kugouMeta.mixSongId ?? '',
    }).toString();

    if (isExternal) {
      // 未登录/无版权时播放地址可能为空；先探测，避免 audio 元素打出一个 404
      try {
        const info = await playRequest();
        if (!info.available) {
          const lyric = await lyricRequest().catch(() => null);
          const lines = lyric ? parseLyric(lyric) : [];
          usePlayerStore.getState().finishLoad(song, lines, info);
          toast(info.reason ?? '这首暂时不可播', 'error');
          return;
        }
      } catch {
        // 探测失败就继续，让音频代理返回具体错误
      }
    }

    el.src = isQQ
      ? `/api/audio/qq/${encodeURIComponent(song.id)}`
      : isKugou
        ? `/api/audio/kugou/${encodeURIComponent(song.id)}?${kugouQuery}`
        : isBodian
          ? `/api/audio/bodian/${encodeURIComponent(song.id)}`
          : `/api/audio/${encodeURIComponent(song.id)}`;
    el.load();
    if (options.autoplay) {
      void el.play().catch(() => {
        // 浏览器可能要求再次点击，错误提示在 toggle 中处理
      });
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artistText,
        album: song.album,
        artwork: song.cover ? [{ src: song.cover, sizes: '500x500' }] : [],
      });
    }

    const [lyricResult, playResult] = await Promise.allSettled([
      lyricRequest(),
      playRequest(),
    ]);
    if (token !== loadToken) return;

    const playInfo =
      playResult.status === 'fulfilled'
        ? playResult.value
        : {
            available: true,
            trial: null,
            fee: song.fee,
            br: 0,
            level: null,
            reason: null,
          };

    let lines: LyricLine[] = [];
    if (lyricResult.status === 'fulfilled') {
      lines = parseLyric(lyricResult.value);
    }

    if (!playInfo.available) {
      el.pause();
      el.removeAttribute('src');
      el.load();
      // 拿不到音源也保留歌词和词高亮，符合“只显示词卡不接歌”
      usePlayerStore.getState().finishLoad(song, lines, playInfo);
      toast(playInfo.reason ?? '这首暂时不可播', 'error');
      return;
    }

    if (lyricResult.status !== 'fulfilled') {
      toast('这首歌暂时没有拿到歌词', 'error');
    }

    usePlayerStore.getState().finishLoad(song, lines, playInfo);
    if (playInfo.trial) {
      toast('这首是会员曲目，先播放 30 秒试听片段', 'info');
    }
  },

  async playFromList(songs: Song[], index: number) {
    const song = songs[index];
    if (!song) return;
    usePlayerStore.getState().setQueue(songs, index);
    await player.loadSong(song, { autoplay: true });
  },

  async next() {
    const { queue, queueIndex } = usePlayerStore.getState();
    if (queue.length < 2 || queueIndex < 0) return;
    const index = (queueIndex + 1) % queue.length;
    const song = queue[index];
    usePlayerStore.getState().setQueue(queue, index);
    await player.loadSong(song, { autoplay: true });
  },

  async previous() {
    const { queue, queueIndex, currentTime } = usePlayerStore.getState();
    if (currentTime > 4 || queue.length < 2 || queueIndex < 0) {
      player.seekTo(0, { play: true });
      return;
    }
    const index = (queueIndex - 1 + queue.length) % queue.length;
    const song = queue[index];
    usePlayerStore.getState().setQueue(queue, index);
    await player.loadSong(song, { autoplay: true });
  },

  async toggle() {
    player.boot();
    const el = getAudio();
    if (!el.src || !usePlayerStore.getState().song) return;
    if (el.paused) {
      try {
        await el.play();
      } catch {
        toast('浏览器拦住了播放，再点一次播放键', 'error');
      }
    } else {
      el.pause();
    }
  },

  setVolume(value: number) {
    player.boot();
    const el = getAudio();
    el.volume = Math.max(0, Math.min(1, value));
    usePlayerStore.getState().setVolume(el.volume);
  },

  toggleMute() {
    player.boot();
    const el = getAudio();
    const muted = el.volume > 0;
    el.muted = muted;
    usePlayerStore.getState().setVolume(muted ? 0 : 0.85);
  },

  async seekTo(time: number, options: { play?: boolean } = {}) {
    player.boot();
    const el = getAudio();
    if (!el.src || !usePlayerStore.getState().song) return null;

    const target = Math.max(0, Math.min(time, Number.isFinite(el.duration) ? el.duration - 0.08 : time));
    el.currentTime = target;

    if (options.play !== false && el.paused) {
      try {
        await el.play();
      } catch {
        // 记录检查时会体现为未播放
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 140));
    const actual = el.currentTime;
    const check = {
      requested: target,
      actual,
      at: Date.now(),
      playing: !el.paused,
      passed: Math.abs(actual - target) <= 0.6 && !el.paused,
    };
    usePlayerStore.getState().setSeekCheck(check);
    return check;
  },
};
