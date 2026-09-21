# Audiobook provider and retry diagnosis

## Verified in this checkout

`POST /api/audiobook` creates a `generate_audiobook` job for uploaded text or a
saved book. The registry dispatches to `generateAudiobookWorker`, which calls
`generateAudioChunk`. That service calls Google's `generateContent` endpoint
with `responseModalities: ['AUDIO']`. It does not call the NVIDIA/text fallback
chain. Manuscript analysis / story-bible import is a separate text-generation
job and can use NVIDIA.

Production configuration for speech:

```dotenv
GEMINI_TTS_MODEL="gemini-3.1-flash-tts-preview"
# Set GOOGLE_AI_API_KEY (or GEMINI_API_KEY) to your Google AI key in Vercel.
```

A NVIDIA key cannot authenticate Gemini. Changing `GEMINI_TEXT_MODEL` or
`NVIDIA_NIM_MODEL` does not select the speech model. Redeploy after changing
production environment variables. Never paste keys into logs or issue reports.

## Changes

- Centralized Gemini TTS configuration with an explicit missing-Google-key error.
- Record provider `Gemini TTS` and configured model on audiobook jobs when the
  worker starts; include the model in preparation progress and server logs.
- Wire differentiated retry messages into the queue: internal time-budget
  exhaustion is not labeled provider overload; audiobook provider failures name
  Gemini TTS. Retry/backoff/refund behavior is unchanged.
- Regression tests verify Google key aliases, the requested model, model override,
  AUDIO modality, unchanged source text, and rejection of NVIDIA-only setup.

## What remains unverified

The supplied HTTP 200 polling trace does not contain the job's underlying
error or job type. No production database or live Gemini request was used here.
Inspect the job's `jobType`, `errorMessage`, `provider`, and `modelName`, or search
Vercel runtime logs for the job ID, to establish its actual failure.

This change does not implement resumable long-audiobook generation. The worker
still synthesizes the book within one invocation; long books can exceed platform
limits. Raising a budget beyond Vercel's function duration is not a safe fix.

## Validation

- Jest: 11 suites, 70 tests passed (mocked provider requests).
- Targeted ESLint: passed.
- Full typecheck could not pass: Prisma client generation was blocked by a TLS
  connection failure to binaries.prisma.sh, leaving missing generated types;
  other type errors also remain. No clean build is claimed.
