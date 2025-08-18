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
\`\`\`sql
- id (uuid, primary key)
- email (text, unique)
- full_name (text)
- avatar_url (text)
- created_at (timestamp)
- updated_at (timestamp)
\`\`\`

#### projects
\`\`\`sql
- id (uuid, primary key)
- user_id (uuid, foreign key)
- title (text)
- script (text)
- status (enum: draft, processing, completed, failed)
- background_id (uuid, foreign key)
- audio_url (text)
- video_url (text)
- created_at (timestamp)
- updated_at (timestamp)
\`\`\`

#### backgrounds
\`\`\`sql
- id (uuid, primary key)
- user_id (uuid, foreign key)
- name (text)
- type (enum: image, video)
- url (text)
- thumbnail_url (text)
- created_at (timestamp)
\`\`\`

#### generated_videos
\`\`\`sql
- id (uuid, primary key)
- project_id (uuid, foreign key)
- user_id (uuid, foreign key)
- url (text)
- thumbnail_url (text)
- duration (integer)
- created_at (timestamp)
\`\`\`

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
4. Server-side Supabase client uses service role for database operations

### Video Generation Pipeline
1. **Script Generation**: OpenAI GPT-4 creates engaging script
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

## Deployment Strategy

### Development Environment
- Local development with hot reloading
- Environment variable management via .env.local
- Database migrations via Supabase CLI

### Production Deployment
- Vercel deployment with automatic builds
- Environment variables via Vercel dashboard
- Database hosted on Supabase cloud
- CDN delivery for static assets

### Monitoring & Observability
- Vercel Analytics for performance monitoring
- Supabase dashboard for database metrics
- Error tracking via built-in Next.js error handling
- Custom logging for business logic events

## Development Workflow

### Code Standards
- TypeScript for type safety
- ESLint and Prettier for code formatting
- Conventional commits for version control
- Component documentation with JSDoc

### Testing Strategy
- Unit tests for utility functions
- Integration tests for API routes
- End-to-end tests for critical user flows
- Manual testing for UI/UX validation

### Version Control
- Feature branch workflow
- Pull request reviews required
- Automated deployment on merge to main
- Semantic versioning for releases

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
- Microservices architecture migration
- Enhanced error monitoring and alerting
\`\`\`

```plaintext file=".gitignore"
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.js
.pnp.cjs

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS generated files
Thumbs.db
ehthumbs.db

# Logs
logs
*.log

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
