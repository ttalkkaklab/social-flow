# Story language and review translations

Read `project_manage status` before new authoring. Optional `languages` settings keep
`speech` (the original language), `subtitles` and `review` separate. Write the story
and spoken lines in `speech`, set each episode character's `tts.language` to that
language, and retain the pinned voice identity. Do not infer output language from a
voice sample's filename. Existing episodes keep their explicit source and media.
Image/video direction stays English under the prompt contract.

For each requested review language, translate the scenario, sequence/scene summaries,
shot titles and summaries, and dialogue. Preserve relationships, speaker, addressee,
inner thoughts and the point where a secret becomes known. Technical IDs, media paths,
timestamps, prompts and generation receipts are not translations.

Save `review-localization.json` beside `scenes.js`:

```json
{
  "version": 1,
  "sourceLanguage": "vi",
  "languages": ["vi", "ko", "en", "zh-Hans", "ja"],
  "entries": [
    {"source": "Đưa tay đây.", "translations": {
      "vi": "Đưa tay đây.", "ko": "손 줘 봐.", "en": "Give me your hand.",
      "zh-Hans": "把手给我。", "ja": "手、貸して。"
    }}
  ]
}
```

`source` is the exact displayed source string, without HTML encoding. One entry per
unique string; repeated identical copy shares its translation. Legacy boards may
mix review prose and spoken languages: supply all requested translations for each
source. Changed source text cannot pick up its previous translation. Missing entries
show source text; incomplete translations are not a completed localized board.

Run `node skills/storyboard/references/storyboard-html.js /absolute/storyboard` to
validate and embed translations for offline viewing. The top floating selector uses
`?storyLang=ja`, then the saved story language, then the source language. UI chrome
continues to use its independent `?lang=en|ko` setting. Translations are escaped at
render time. Selecting a language never edits SCENES, source dialogue, audio,
performance timing or production prompts. Refresh after every source/translation edit.

Subtitle files are separate artifacts, explicitly requested by the user. Time them
against the delivered master, record its hash, and preserve silent intervals. Upload
language tracks only on platforms that accept them. A review translation file does
not claim that remote subtitles exist or control a viewer's caption preferences.
