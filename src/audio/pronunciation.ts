/**
 * Browser speech-synthesis pronunciation provider, extracted verbatim from the
 * legacy word-card page during the ammo migration.
 *
 * Browser TTS output cannot be routed through a Web Audio gain node, so this
 * provider cannot do true volume ramps. The focus-card sequence accounts for
 * that by treating pronunciation as a hard-started, hard-stopped event.
 */
function speak(word: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.86;
  window.speechSynthesis.speak(utterance);
}

export const browserTts = {
  supportsGainRamp: false,
  speak,
};
