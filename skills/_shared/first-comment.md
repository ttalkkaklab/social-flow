# Episode first comments

Use this when produce prepares a story episode's platform copy, or when the user asks
to add an opening comment to an existing post. Prepare one comment per target platform
at `output/<platform>/first-comment.md`. Preparing copy does not publish it. Respect
an explicit opt-out, supplied wording and the channel's language.

## Write the relationship, then the surprise

Read the episode's scenario, opening scene and character identities. In two or three
short sentences, introduce the characters and the relationship that makes the opening
surprising, then describe that incident while withholding its explanation or outcome.
An optional question can invite the viewer to take the recipient's position. It should
be answerable from the situation, not demand a like, tag or reply.

Example for a strict boss inviting her nervous employee home:

> 호랑이 같은 여상사 모찌, 모찌 앞에만 서면 쩔쩔매는 부하 직원 버.
> 그런데 오늘은 모찌가 자기 집에서 같이 자자고 한다… 버는 따라가도 괜찮을까?

The example is a pattern, not reusable canon. Establish names, roles and the relevant
imbalance from this episode. Do not invent daily scolding, romance, threats or sexual
events, and do not reveal a held motive, confession or ending. Make the opening vivid
with its actual action instead of unsupported superlatives. Avoid recapping the whole
episode or copying the title and caption. Write naturally in the audience's language;
translate the relationship, not Korean honorifics word for word.

Adapt the rhythm to each platform. YouTube can introduce both roles clearly; Instagram
can keep the setup conversational; TikTok can compress it; Facebook can follow the hook
with the approved related/source link. These are writing options, not length quotas.
Keep any required attribution. For factual or non-story work, introduce the actual
subject and unresolved opening question instead of inventing characters or conflict.

## Publish under the episode's authorization

Include all proposed first comments with the platform copy when seeking publication
authorization. Reuse a user's existing instruction to publish these comments, including
an instruction that delegates their wording. Do not ask again just because a comment
uses a different transport from the video. A video-only approval, a production request
or this writing default alone does not authorize additional public comments.

After each approved post is actually public, use its returned ID/permalink and confirm
the signed-in author is the intended channel. Post one **top-level channel comment**
promptly. Here “first comment” means the channel's opening comment: audience comments
may already exist, and platform sorting can place them above it. Do not claim guaranteed
chronological position or pin the comment unless requested.

| Platform | Route and target |
|---|---|
| Facebook | `facebook_comment`, with the matching `channel` and the post's actual `postId`. Put the hook and any approved link in one comment, not two competing first comments. |
| YouTube | Use the channel's signed-in watch/Shorts comment composer in ego lite after the private upload becomes public. |
| Instagram | Use the publishing account's reel/post comment composer in ego lite. Verify the Instagram comment separately from Facebook comments shown on a cross-post. |
| TikTok | Use the publishing account's public video comment composer in ego lite. An inbox draft or a pending/reviewing upload is not yet a published target. |
| Threads | Use the plugin's supported draft-bound self-reply route when available. Reuse an approved existing fallback self-reply; combine its link with the hook instead of posting a second opening reply. |

Discover the installed tools before choosing a route. `sns_comment_reply` replies to an
existing comment on most platforms; do not pass a post ID as a comment ID or assume it
creates a top-level comment. If no suitable plugin tool exists, use ego lite according
to the browser skill. No second browser fallback. If commenting is disabled or the
account cannot access it, record the limitation and keep the approved text ready.

## Verify and resume without duplicates

Before sending, inspect `output/first-comments.json` and the target's existing comments.
An already matching channel comment completes the task; capture its ID/permalink and
do not send again. An uncertain submission requires checking the same post before any
retry. A changed draft does not justify an extra comment: edit the existing channel
comment within authorization, or report that editing is unavailable.

Maintain `output/first-comments.json` with one entry per platform/post, including:

- platform, channel/account, post ID and permalink;
- exact final text, its SHA-256, and the user's authorization or standing-plan reference;
- status (`prepared`, `submitting`, `published`, `submission_unknown`, `failed`,
  `unavailable`), attempt time and error/limitation when relevant;
- comment ID/permalink when exposed, verification time and the observed author/text.

Write `submitting` before the external action. A timeout, disconnected browser or stale
comment list means `submission_unknown`, not failure. Inspect the receipt and reload
the same target's comments; do not resubmit merely because a count or list has not
updated. A definitive rejection with no created comment may be retried after its cause
is fixed, without republishing the video. Never fabricate a comment ID when the UI does
not expose one.

Check the posted text and channel author on the actual target, using its permalink or
the current comment list. A submit click or incremented comment count is insufficient.
Record evidence in the receipt and `output/publish-log.md`. Report video publication,
cover, playlist and first-comment outcomes separately; do not mark the whole request
complete while a requested comment is unverified.
