# Drama Studio

A working MVP of an AI short-drama platform in the spirit of AniShort: paste a script, get a shot list, lock in your
cast, generate keyframes and video clips with the model of your choice, add voices, and render a finished vertical
episode. Everything happens on a node canvas (script → characters → shots → episode), a storyboard list, and a
preview player.

It runs **fully offline with no API keys** (placeholder frames, ffmpeg animatics, Windows system voices) so you can try
the whole flow for free, then switch individual steps to real models.

## Quick start

Requirements: Node 20+ and [ffmpeg](https://ffmpeg.org/) on your PATH.

```bash
npm install
npm run dev
```

Open http://localhost:3000, click **Open sample**, then **▶ Make episode**. About 10 seconds later you have a 45-second
MP4 with voices and subtitles (offline placeholders).

## Using real AI models

1. Copy `.env.example` to `.env.local`.
2. Add the keys you have:
   - `FAL_KEY` ([fal.ai](https://fal.ai/dashboard/keys)): one key for Seedance 2.0, Kling 3.0, Veo 3.1, Wan 3.0,
     Seedream 5.0 and ElevenLabs. Easiest for an overseas product.
   - `ARK_API_KEY` ([Volcengine Ark 火山方舟](https://console.volcengine.com/ark)): ByteDance's own hosting of Seedance 2.0,
     Seedream and Doubao. Best for mainland China. Set `ARK_BASE_URL` to BytePlus for the international version.
   - `ANTHROPIC_API_KEY`: Claude turns scripts into shot lists with character looks and model-ready prompts.
     Without it (and without Ark) an offline rule-based splitter is used.
3. Restart `npm run dev` and pick models in the studio's top bar.

Rough cost of the 45-second sample (9 shots, 4 characters), list prices Sept 2026:

| Setup | Images | Video | Total |
|---|---|---|---|
| Seedream 5 Pro + Seedance 2.0 | ~$0.90 | 44 s × $0.30 = ~$13.30 | **~$14** |
| Seedream 5 Pro + Seedance 2.0 Fast | ~$0.90 | 44 s × $0.24 = ~$10.60 | **~$11.50** |
| Seedream 5 Pro + Wan 3.0 (720p, 5 s clips) | ~$0.90 | 45 s × $0.10 = ~$4.50 | **~$5.40** |

The studio shows an estimate before every batch, and tracks estimated spend per project.
`npm run check:fal` validates every request body the app can send against fal's live schemas, without spending money.

## How AI video generation works (what this app automates)

Platforms like AniShort don't train their own video models. They orchestrate third-party models through APIs and
solve the hard part: **keeping characters consistent across dozens of 5–15 second clips.**

1. **Script → shot list.** An LLM splits the story into shots of 4–15 s (the length video models can generate) and
   writes, for each one, a still-image prompt (first frame), a motion prompt, camera direction and dialogue.
2. **Cast references.** Each character gets one reference image generated from a fixed visual description
   (age, face, hair, outfit). That description is reused verbatim in every prompt.
3. **Keyframes.** For each shot an image-*editing* model (Seedream, Nano Banana, FLUX Kontext…) receives the
   character reference images plus the shot prompt, so the same faces and outfits appear in every frame.
4. **Image-to-video.** A video model (Seedance, Kling, Veo, Wan…) animates each keyframe. Starting from a picture
   instead of text is what keeps identity stable in motion. Generation is asynchronous: submit a job, poll for
   30 s–5 min, download the file (provider URLs expire, so keep a copy).
5. **Voice.** Either *native* (Seedance 2.0, Veo 3.1, Kling 3 speak the quoted dialogue with lip sync in the same
   pass) or *dubbed* (TTS per line, e.g. ElevenLabs, laid over the clip; better voice consistency across shots).
6. **Edit.** ffmpeg normalizes clips, lays in audio, burns subtitles and concatenates everything into the episode.

## Code map

| Path | What it does |
|---|---|
| `lib/models.ts` | Model catalog and prices. Add or swap models here. |
| `lib/prompts.ts` | How character, keyframe and video prompts are assembled |
| `lib/server/jobs.ts` | Job lifecycle: queue per provider, submit, poll, download, resume after restart |
| `lib/server/providers/` | `fal.ts`, `ark.ts` (Volcengine), `mock.ts` (offline) |
| `lib/server/breakdown/` | Script → shots with Claude, Doubao, or the offline rules |
| `lib/server/render.ts` | ffmpeg edit: segments, audio, subtitles, concat |
| `lib/server/pipeline.ts` | "Make episode": refs → keyframes → videos → voices → export |
| `app/api/` | REST API used by the UI |
| `components/studio/` | Canvas (React Flow), storyboard, preview, editors |
| `data/` | Local database (`db.json`) and generated media (git-ignored) |

## From this MVP to a production platform

| Area | MVP (this repo) | Production |
|---|---|---|
| Users | single local user | accounts, teams, roles; phone/WeChat login for China |
| Data | `data/db.json` | Postgres (Prisma/Drizzle) |
| Media | local disk | S3/R2 or Aliyun OSS / Volcengine TOS + CDN |
| Jobs | in-process queue + polling | Redis/BullMQ or Inngest/Trigger.dev workers; provider webhooks |
| Billing | spend estimate | credit ledger (积分), Stripe / WeChat Pay / Alipay, margin over provider cost |
| Collaboration | none | real-time canvas (Yjs/Liveblocks), review links and comments |
| Editing | fixed cut | timeline editor: trims, transitions, music, audio mix |
| Consistency | reference images → keyframes | Seedance 2.0 reference-to-video, Kling elements, per-character LoRA, 3D blocking |
| Series tools | one episode | batch episodes, re-skin/re-dub existing dramas for other markets |
| Compliance | – | moderation; AI-content labeling; in China also ICP filing and generative-AI service filing/registration |

Limitations of the MVP: single process and single user; the real-provider code paths are written against the
providers' current API docs and validated against fal's schemas, but need your keys for an end-to-end test; prices
are estimates.
