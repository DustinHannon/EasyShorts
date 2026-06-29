# EasyShorts - AI Video Creator

[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app)
[![Live on Vercel](https://img.shields.io/badge/Live-easyshorts.vercel.app-blue?style=for-the-badge)](https://easyshorts.vercel.app)

## Overview

EasyShorts is an AI-powered video creation platform that transforms text ideas into engaging TikTok and YouTube Shorts. The application combines AI script generation, voice synthesis, and automated video composition to create viral-ready content through a streamlined web interface.

**Live**: [easyshorts.vercel.app](https://easyshorts.vercel.app)

## How It Works

1. **Script Generation**: AI generates engaging scripts optimized for short-form content using GPT-5.4
2. **Voice Synthesis**: Converts scripts to natural-sounding speech with multiple voice options
3. **Background Selection**: Users can upload custom backgrounds or generate AI images
4. **Video Assembly**: Client-side FFmpeg processing combines audio, background, and captions into final video
5. **Export & Share**: Generated videos are stored and available for download or sharing

## Tech Stack

- **Framework**: Next.js 16 with App Router, React 19, TypeScript
- **Database & Auth**: Supabase (PostgreSQL + Auth + RLS)
- **File Storage**: Vercel Blob
- **AI**: Azure AI Foundry (GPT-5.4 for scripts, gpt-4o-mini-tts for voice, gpt-image-1.5 for images)
- **Video Processing**: FFmpeg.wasm (client-side)
- **UI**: Tailwind CSS, Radix UI, shadcn/ui
- **Hosting**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Local Development

```bash
# Clone the repo
git clone https://github.com/DustinHannon/EasyShorts.git
cd EasyShorts

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your values (see Environment Variables below)

# Run development server
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/publishable key |
| `AZURE_AI_KEY` | Yes | Azure AI Foundry API key (server-side only) |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob storage token |
| `OPENAI_API_KEY` | No | OpenAI key for audio-synced captions (Whisper word timestamps). Without it, captions fall back to estimated timing. |

### Database Setup

Run the complete schema setup against your Supabase project:

```bash
# Via Supabase SQL Editor or CLI
psql -f scripts/full-database-setup.sql
```

This creates 4 tables with RLS policies: `profiles`, `projects`, `backgrounds`, `generated_videos`.

## Key Features

- **Hook-first AI Scripts** - Retention-optimized, hook-first scripts with GPT-5.4, plus a live duration/word-count estimate and a sub-60s monetization warning
- **Niche Templates** - One-click presets for top faceless formats (Reddit story, scary story, motivation, finance, did-you-know, history)
- **Multi-voice TTS** - Natural speech synthesis via gpt-4o-mini-tts
- **Background Library** - 24 built-in presets across 6 categories, plus upload or AI-generate (gpt-image-1.5)
- **Audio-synced Captions** - Word-level timing via OpenAI Whisper (`OPENAI_API_KEY`), with graceful fallback to estimated timing
- **Editable Review** - Edit the script on the final step before rendering
- **Client-side Render** - FFmpeg.wasm compose in the browser with selectable quality tiers (720p/1080p/4K)
- **Project Management** - Dashboard with creation history
- **Responsive Design** - Mobile-optimized interface

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate-script` | POST | Generate video script with AI (rate-limited per user/day) |
| `/api/generate-speech` | POST | Convert text to speech (rate-limited per user/day) |
| `/api/generate-image` | POST | Generate background image with gpt-image-1.5 (rate-limited per user/day) |
| `/api/transcribe` | POST | Transcribe the voiceover to word-level timestamps for synced captions (OpenAI Whisper; degrades gracefully if `OPENAI_API_KEY` is unset) |
| `/api/video/upload` | POST | Issue a Vercel Blob client-upload token for the final video |
| `/api/video/record` | POST | Persist generated-video metadata to the database |
| `/api/background/upload` | POST | Issue a Vercel Blob client-upload token for a custom background |
| `/api/background/record` | POST | Persist uploaded-background metadata to the database |
| `/api/video-progress/[projectId]` | GET | Track video generation progress |

Video and background **deletes** go through server actions (`lib/supabase/actions.ts`), not API routes. All AI endpoints enforce a per-user daily quota via the `consume_ai_quota` Postgres function.

## Database Schema

- **profiles** - User account information (auto-created on signup)
- **projects** - Video project metadata, scripts, settings, and progress tracking
- **backgrounds** - User-uploaded and AI-generated backgrounds
- **generated_videos** - Final video outputs with metadata

All tables use Row Level Security (RLS) — users can only access their own data.

## License

MIT
