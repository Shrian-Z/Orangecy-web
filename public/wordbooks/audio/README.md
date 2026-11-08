# Word audio

Finished pronunciation files under `us/`, `uk/`, and optional `ex/` are recordings by **Word Atlas contributors**, licensed **CC BY 4.0**. Voices: ElevenLabs Alice (UK) and Sarah (US).

Orangecy plays `/wordbooks/audio/us/{word}.mp3` when that file exists, then `uk/` if the US file 404s or errors, and uses browser speech only after both fail. Tapping the word and the automatic pronounce step share that path. `manifest.json` is only the index written by the sync script; playback does not skip a file because it is absent from the manifest.

The MP3 binaries are gitignored. From a local Word Atlas checkout:

```bash
node scripts/sync-word-audio.mjs
# source default: ~/Desktop/word-atlas/public/atlas/audio
# or: node scripts/sync-word-audio.mjs --from /path/to/word-atlas/public/atlas/audio
```

The script hardlinks headwords from `cet4`, `cet6`, and `gaozhong` (override with `--books` or `--wordbook`). `--examples` also links `ex/`. `--copy` copies instead of hardlinking.

Manual check after syncing: open a card for a headword that has `us/{word}.mp3` (for example `ability`) and confirm both the automatic clip and a tap on the word play the file. A headword with no file (for example `abruptly`) stays on the browser voice. Mute, or leaving the card, stops the MP3.
