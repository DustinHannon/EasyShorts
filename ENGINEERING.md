# Engineering Documentation

## Architecture Overview

EasyShorts follows a modern full-stack architecture with clear separation of concerns:

### Frontend Architecture
- **Next.js App Router**: Server-side rendering with client-side interactivity
- **Component-based Design**: Modular UI components with shadcn/ui
- **State Management**: React hooks and context for local state
- **Form Handling**: Plain controlled React state (`useState`) — no form library or client-side schema validation; inputs are validated server-side in the API routes
- **Styling**: Tailwind CSS with custom design system

### Backend Architecture
- **API Routes**: Next.js API routes for server-side logic
- **Database**: Supabase PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth with JWT tokens
- **File Storage**: Vercel Blob for media assets
- **AI Integration**: Azure AI Foundry for content generation

## Database Design

### Core Tables

#### profiles
```sql
- id (uuid, primary key, references auth.users)
- email (text)
- full_name (text)
- avatar_url (text)
- created_at (timestamptz)
- updated_at (timestamptz)
```

#### projects
```sql
- id (uuid, primary key)
- user_id (uuid, foreign key -> auth.users, cascade delete)
- title (text, not null)
- description (text)
- script (text)
- voice_settings (jsonb, default '{}')
- background_url (text)
- background_type (text, check: image/video/color)
- video_settings (jsonb, default '{}')
- status (text, check: draft/processing/completed/failed)
- progress (integer, default 0)              -- vestigial, see note
- progress_stage (text, default 'waiting')   -- vestigial, see note
- progress_message (text, default 'Waiting to start...') -- vestigial, see note
- created_at (timestamptz)
- updated_at (timestamptz)
```

The three `progress*` columns are **currently unused**: nothing in the app writes them, and the polling route that once read them (`/api/video-progress/[projectId]`) was deleted as dead code — render progress is client-side React state in the wizard. The columns are deliberately retained (dropping columns is irreversible) and still ship in `scripts/full-database-setup.sql`.

#### backgrounds
```sql
- id (uuid, primary key)
- user_id (uuid, foreign key -> auth.users, cascade delete)
- name (text, not null)
- url (text, not null)
- type (text, check: image/video, not null)
- size (integer)
- created_at (timestamptz)
```

#### generated_videos
```sql
- id (uuid, primary key)
- project_id (uuid, foreign key -> projects, on delete set null)
- user_id (uuid, foreign key -> auth.users, cascade delete)
- url (text, not null)
- format (text, not null)
- quality (text, not null)
- duration (integer)
- size (integer)
- background_url (text)
- background_type (text)
- created_at (timestamptz)
```

#### ai_usage
```sql
- user_id (uuid, foreign key -> auth.users, cascade delete)
- day (date, default (now() at time zone 'utc')::date)
- kind (text)
- count (integer, default 0)
- primary key (user_id, day, kind)
```

Quota counters are **read-only to clients**: the table has a SELECT policy only and no INSERT/UPDATE policy. All mutation happens through the SECURITY DEFINER function `consume_ai_quota(p_kind text, p_limit integer)`, which increments the counter and returns `false` once the day's limit is reached (the calling route then returns 429). Current per-day limits: script = 50, speech = 50, image = 20, transcribe = 50.

### Security Model

Row Level Security (RLS) policies ensure data isolation:
- Users can only access their own profiles, projects, backgrounds, and videos
- No service-role key is used anywhere; every server route and server action uses the cookie-bound anon-key client, so RLS is always enforced
- JWT tokens validate user identity on each request

## API Design

### Authentication Flow
1. User signs up/logs in via Supabase Auth
2. JWT token stored in httpOnly cookie
3. Root `proxy.ts` (Next 16's replacement for the deprecated `middleware.ts` file convention) validates the token on protected routes, delegating to `updateSession` in `lib/supabase/middleware.ts`
4. Server-side Supabase client uses cookie-based auth for database operations

### Video Generation Pipeline
1. **Script Generation**: Azure AI Foundry GPT-5.4 creates engaging script
2. **Voice Synthesis**: Azure AI Foundry gpt-4o-mini-tts converts script to audio
3. **Background Selection**: User chooses a preset (24 built-in), an uploaded, or an AI-generated background; optional Ken Burns zoom/pan animation
4. **Caption Sync** (optional): the voiceover is transcribed (OpenAI Whisper via `/api/transcribe`) to word-level timestamps so captions burn in aligned to the audio; falls back to estimated timing if `OPENAI_API_KEY` is unset
5. **Video Composition**: Client-side FFmpeg.wasm combines audio + background (+ optional `zoompan` animation and captions) at 24fps
6. **Upload & Storage**: Final video uploaded to Vercel Blob

### Error Handling
- Structured error responses with consistent format
- Client-side error boundaries for graceful degradation
- Logging and monitoring for production debugging

## Performance Considerations

### Frontend Optimization
- **Code Splitting**: No `next/dynamic` boundaries exist — the App Router's per-route splitting is the only division. The one genuinely heavy asset is the FFmpeg.wasm core, which is fetched lazily at render time rather than bundled
- **Image Optimization**: Next.js image optimization is disabled (`images.unoptimized: true` in `next.config.mjs`); backgrounds are served as static assets from `public/` and from Vercel Blob
- **Bundle Analysis**: Not set up — no bundle analyzer is installed and no size budget is enforced
- **Caching**: Aggressive caching of static assets

### Backend Optimization
- **Database Indexing**: Composite `(user_id, created_at DESC)` indexes — `idx_projects_user_created`, `idx_generated_videos_user_created`, `idx_backgrounds_user_created` — serve the `WHERE user_id = $1 ORDER BY created_at DESC` list queries on the dashboard and gallery; single-column `user_id` (and `project_id`) indexes remain for the RLS/foreign-key lookups
- **Connection Pooling**: Supabase handles connection management
- **File Storage**: CDN delivery via Vercel Blob
- **AI Quotas**: Per-user daily quotas on the AI routes via the `consume_ai_quota` RPC (429 when exhausted); there is no general request throttling

### Video Processing
- **Client-side Processing**: Single-threaded FFmpeg.wasm in the browser — no server compute (Vercel serverless is too constrained for video encoding). The multi-threaded core (`@ffmpeg/core-mt`) was evaluated and is **not viable here**: it requires COEP cross-origin isolation, which breaks the FFmpeg worker load under Next 16 + Turbopack.
- **Speed**: 720p `veryfast` preset, 24fps, and parallel asset downloads keep render times down within the single-thread constraint
- **Compression**: CRF-based output tuned per quality tier for web delivery

## Security Measures

### Authentication & Authorization
- JWT-based authentication with secure token handling
- Row Level Security for database access control
- CSRF protection via SameSite cookies
- Input validation and sanitization

### Data Protection
- Environment variable management for secrets
- HTTPS enforcement in production
- Secure file upload validation
- SQL injection prevention via parameterized queries

### Content Safety
- Input validation for user-generated content
- File type restrictions for uploads
- Rate limiting on AI API calls
- Content moderation hooks (future enhancement)

## Deployment

### Infrastructure
- **Hosting**: Vercel (Pro plan)
- **Database**: Supabase (PostgreSQL 17)
- **File Storage**: Vercel Blob
- **Domain**: easyshorts.vercel.app

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous key
- `AZURE_AI_KEY` — Azure AI Foundry API key (server-side only)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob storage token
- `OPENAI_API_KEY` — (optional) OpenAI key for audio-synced captions via Whisper word timestamps; without it, captions fall back to estimated timing

### Local Development
```bash
pnpm install
pnpm dev
pnpm test   # vitest
```

### Production Deployment
- Automatic deployment on push to `main` via Vercel git integration
- Environment variables configured in Vercel dashboard
- `vercel.json` contains a single `functions` block giving API routes a 60s max duration — nothing else
- The production build emits zero warnings

## Development Workflow

### Code Standards
- TypeScript for type safety
- ESLint (flat config in `eslint.config.mjs`, run via `pnpm lint`) and vitest (`pnpm test`, config in `vitest.config.ts`); no Prettier is installed — formatting follows existing file style
- Test coverage is targeted, not blanket: `lib/captions.ts` is the covered module (`lib/captions.test.ts` — 20 tests over caption grouping, pause splitting, window monotonicity and sanitisation)
- Conventional commits for version control

### Version Control
- Sole engineer; commits go directly to `main`
- No pull-request gate — correctness is enforced by running `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, and `pnpm build` before pushing
- Pushing `main` triggers the Vercel production deploy

## Future Enhancements

### Planned Features
- Advanced video editing capabilities
- Multiple AI voice options
- Batch video generation
- Social media scheduling integration
- Analytics and performance tracking

### Technical Improvements
- WebRTC for real-time collaboration
- Advanced caching strategies
- Enhanced error monitoring and alerting
