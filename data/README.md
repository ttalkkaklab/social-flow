# data/ — content data root

The **per-channel directories** the user operates live under here — one channel
(brand) is one directory, and its output publishes to multiple SNS platforms
(Threads·Instagram·Facebook·YouTube). The structure maps 1:1 to the pipeline's
three stages:

```
data/
└── <channel slug>/                  # created by /social-flow:channel add
    ├── profile.md                   # channel profile (tone·voice·theme·platform SoT)
    ├── assets/                      # channel-shared assets — only what two or more episodes reuse
    │   ├── catalog.md               #   kind+id → path (resolve-asset.py reads this)
    │   ├── branding/                #   profile logo (master + platform resizes)
    │   ├── intro/                   #   intro master·stinger·lockup·sonic logo
    │   ├── outro/                   #   default.mp4 · per-platform youtube.mp4 / instagram.mp4
    │   ├── characters/<id>/         #   sheets for keeping the same face across episodes (front/side/back/full)
    │   ├── audio/bgm/ · audio/sfx/  #   channel default BGM · recurring SFX
    │   ├── stills/                  #   stills you pull back out (swatches·products·card props)
    │   ├── fonts/                   #   subtitle ttf — produce copies them into .work/fonts/
    │   └── scratch/                 #   throwaway candidates (voice tests etc.)
    ├── growth/                      # growth-skill state
    │   ├── <platform>/              #   per platform — growth-plan.md (standing authorization)·state.json·growth-log.md (threads/·youtube/·instagram/)
    │   ├── review-recent.html       #   /social-flow:review-recent — feedback on the last 5 YouTube/Instagram episodes (funnel·comparison bars)
    │   ├── keywords/                #   /social-flow:topic-scout — market topic scouting
    │   │   ├── market-keywords.html #     the report humans read (funnel·multiplier bars)
    │   │   └── market-keywords.md   #     source of truth for the numbers and picked phrases the loop reads
    │   ├── autoproduce.json         #   channel-shared — autoproduction budget·history (one video goes out on both platforms, so it isn't split per platform)
    │   └── .autoproduce.lock/       #   channel-shared lock — keeps two growth loops from authoring at once (mkdir atomicity; locks older than 60 min are dead)
    └── episodes/                    # episodes — same level as assets. one topic = one directory
        └── <topic slug>/
            ├── storyboard/          # stage 1: image-included storyboard
            │   ├── research.md      #   research/verification ledger
            │   ├── storyboard.md    #   the document a human approves (status tracking)
            │   ├── storyboard.html  #   review render — loads scenes.js directly (from the skill template)
            │   ├── scenes.js        #   machine-readable SoT (THEME+SCENES)
            │   ├── script.md        #   shooting mode only — shooting script
            │   └── images/          #   per-scene 9:16 generated images (skipped in shooting mode)
            ├── .work/               # production intermediates (gitignored)
            └── output/              # stage 2: per-platform content
                ├── video/           #   video.mp4 (clean) · video-sub.mp4 (burned-in) · subs.srt · cover.jpg · build-report.txt · cost-report.txt (autoproduced runs)
                ├── threads/post.md
                ├── instagram/caption.md
                ├── facebook/post.md
                ├── youtube/meta.md
                └── publish-log.md   # publish record (permalinks)
```

- **Episodes go under `episodes/`** — the channel root has four slots: `profile.md` ·
  `assets/` · `growth/` · `episodes/`. Don't put topic directories at the channel
  root. Move old layouts into `episodes/<topic>/`. The lookup glob is
  `data/<channel>/episodes/*/storyboard/`.
- **`assets/` holds shared things only** — single-episode artifacts (episode BGM,
  scene PNGs, TTS) go in that episode's `.work/`. Finals go at the top of their
  kind folder, intermediates in the `.work/` inside it.
  Look assets up with `skills/channel/references/resolve-asset.py <channel-dir> <kind> [id]`.
  Even without a catalog row, it finds default paths like `outro/default.mp4`
  and the old `assets/outro.mp4`. Don't create empty kind folders — open one
  only once a file exists.
- Progress is tracked by `status` in `storyboard.md` frontmatter:
  `draft → approved → produced → published`. **Topics autoproduce creates skip
  `approved` and start at `produced`** — they passed the machine gate instead of
  human approval, marked apart by `auto_produced: true` and `approved_by`.
- Raw video/audio (mp4/wav) is excluded from commits by `.gitignore` — regenerable.
- **SNS publish tokens don't live in this directory** — they go outside the repo
  in `~/.config/social-flow/<channel slug>/` (same slug as under data/), and the
  publish tools' `channel` argument points at that directory.
