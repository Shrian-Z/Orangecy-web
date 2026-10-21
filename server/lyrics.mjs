const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;
const CREDIT =
  /^(作词|作曲|编曲|制作人|混音|母带|录音|录音工程|录音师|吉他|贝斯|鼓|弦乐|和声|合声|监制|发行|出品|出品人|词|曲|键盘|钢琴|小提琴|中提琴|大提琴|编程|人声|配唱|配唱制作人|特别支持|特别感谢|鸣谢|致谢|美术|设计|统筹|企划|宣传|经纪|版权|营销|推广|封面|摄影|插画|视觉|字体|制作助理|音乐总监|项目统筹|op|sp|produced|written|composed|arranged|mixed|mastered|lyrics|music|producer|mixing|mastering|recording|guitar|bass|drums|strings|vocals|piano|keyboard|violin|cello|choir)\s*[:：]/i;

const SHORT_LABEL = /^[\u4e00-\u9fffA-Za-z0-9·&\- ]{1,12}\s*[:：]\s*\S/;

function toSeconds(m, s, frac) {
  const ms = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0;
  return Number(m) * 60 + Number(s) + ms / 1000;
}

export function parseLrc(raw) {
  const lines = [];
  for (const row of String(raw ?? '').split(/\r?\n/)) {
    TIME_TAG.lastIndex = 0;
    const tags = [...row.matchAll(TIME_TAG)];
    if (!tags.length) continue;
    const text = row.replace(TIME_TAG, '').replace(WORD_TAG, '').trim();
    if (!text || CREDIT.test(text) || SHORT_LABEL.test(text)) continue;
    for (const tag of tags) {
      lines.push({ time: toSeconds(tag[1], tag[2], tag[3]), text: text.slice(0, 180) });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
