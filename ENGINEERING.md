# Engineering Documentation

## Architecture Overview

EasyShorts follows a modern full-stack architecture with clear separation of concerns:

### Frontend Architecture
- **Next.js App Router**: Server-side rendering with client-side interactivity
- **Component-based Design**: Modular UI components with shadcn/ui
- **State Management**: React hooks and context for local state
- **Form Handling**: React Hook Form with Zod schema validation
- **Styling**: Tailwind CSS with custom design system

### Backend Architecture
- **API Routes**: Next.js API routes for server-side logic
- **Database**: Supabase PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth with JWT tokens
- **File Storage**: Vercel Blob for media assets
- **AI Integration**: OpenAI API for content generation

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
- progress (integer, default 0)
- progress_stage (text, default 'waiting')
- progress_message (text, default 'Waiting to start...')
- created_at (timestamptz)
- updated_at (timestamptz)
```

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

### Security Model

Row Level Security (RLS) policies ensure data isolation:
- Users can only access their own profiles, projects, backgrounds, and videos
- Service role bypasses RLS for admin operations
- JWT tokens validate user identity on each request

## API Design

### Authentication Flow
1. User signs up/logs in via Supabase Auth
2. JWT token stored in httpOnly cookie
3. Middleware validates token on protected routes
4. Server-side Supabase client uses cookie-based auth for database operations

### Video Generation Pipeline
1. **Script Generation**: OpenAI GPT-4o creates engaging script
2. **Voice Synthesis**: OpenAI TTS converts script to audio
3. **Background Selection**: User chooses from uploaded/generated backgrounds
4. **Video Composition**: Client-side FFmpeg combines audio and background
5. **Upload & Storage**: Final video uploaded to Vercel Blob

### Error Handling
- Structured error responses with consistent format
- Client-side error boundaries for graceful degradation
- Logging and monitoring for production debugging

## Performance Considerations

### Frontend Optimization
- **Code Splitting**: Dynamic imports for heavy components
- **Image Optimization**: Next.js Image component with lazy loading
- **Bundle Analysis**: Regular bundle size monitoring
- **Caching**: Aggressive caching of static assets

### Backend Optimization
- **Database Indexing**: Optimized queries with proper indexes
- **Connection Pooling**: Supabase handles connection management
- **File Storage**: CDN delivery via Vercel Blob
- **API Rate Limiting**: Prevent abuse with request throttling

### Video Processing
- **Client-side Processing**: Reduces server load using FFmpeg.wasm
- **Progressive Loading**: Stream processing for large files
- **Compression**: Optimized output settings for web delivery

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
- `OPENAI_API_KEY` — OpenAI API key (server-side only)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob storage token

### Local Development
```bash
pnpm install
pnpm dev
```

### Production Deployment
- Automatic deployment on push to `main` via Vercel git integration
- Environment variables configured in Vercel dashboard
- API functions have 60s max duration (vercel.json)

## Development Workflow

### Code Standards
- TypeScript for type safety
- ESLint and Prettier for code formatting
- Conventional commits for version control

### Version Control
- Feature branch workflow
- Pull request reviews required
- Automated deployment on merge to main

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
