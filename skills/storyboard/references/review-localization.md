# Story language and review translations

Read `project_manage status` before new authoring. Optional `languages` settings keep
`speech` (the original language), `subtitles` and `review` separate.

The story language of a new episode is, in this order:

1. the language the user names for it ("write this one in Japanese");
2. the saved `languages.speech`;
3. the language the channel already works in: what its `profile.md` says or is written
   for, its cast's `tts.language`, and the language of its earlier episodes;
4. the language the user wrote the request in.

The channel's language wins over the request's: an owner who writes in Korean about a
Vietnamese channel gets a Vietnamese story. A channel with no profile language, cast or
episodes yet has only the request to go by. Do not ask which language; say in the scenario
presentation which one was used and why. A resumed board stays in the language its text
is in, whatever language the request to continue it arrives in.
Pass it to the first `story_sequence` as `language` (BCP-47: `en`, `zh-Hans`, `ja`, `es`,
`fr`, `de`, `vi`, `ko`). The board records it as `STORY.language`, a new episode board
without the argument takes the saved `speech`, and a board that has a language or has
shots keeps it (`story_language` warning).

Write the synopsis, scenario, sequence and scene text, shot summaries and spoken lines in
that language, and set each episode character's `tts.language` to its primary subtag
(`zh-Hans` → `zh`), retaining the pinned voice identity. `tts` is spelled the way the line
is said in that language and `sub` the way it is written; Korean and Japanese lines spell
numbers and loanwords out. Do not infer output language from a voice sample's filename.
Existing episodes keep their explicit source and media. Image/video direction, `expression`
and `extras` stay English under the prompt contract. Questions, reports and the scenario
presentation use the language the user is writing in, whatever the story's is.

Untimed lines are timed from syllables in English, Chinese, Japanese, Spanish, French,
German, Vietnamese and Korean. Only the Korean rate was fitted on made clips; the others
read `speechRate:"uncalibrated"` and run slow on purpose. Another language is still
written and voiced, with line timing estimated at a generic rate or left unknown. Whether a TTS or
video model speaks a language well is not checked here: listen to the first clip. The
Korean style rules (`korean-style.md`) apply to Korean text only.

For each requested review language, translate the scenario, sequence/scene summaries,
shot titles and summaries, and dialogue. Include the authored scene sound directions
in `audienceSound.reason`, `perspective`, `shift` and `exit`. Preserve relationships, speaker, addressee,
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
