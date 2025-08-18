# EasyShorts - AI Video Creator

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app)

## Overview

EasyShorts is an AI-powered video creation platform that transforms ideas into engaging TikTok and YouTube Shorts. The application combines AI script generation, voice synthesis, and automated video composition to create viral-ready content in minutes.

## Features

- **AI Script Generation**: Generate engaging scripts tailored for viral content using OpenAI GPT-4
- **Voice Synthesis**: Convert scripts to natural-sounding speech with multiple voice options
- **Background Management**: Upload and manage custom backgrounds or generate AI images
- **Video Composition**: Automated video assembly with client-side FFmpeg processing
- **Real-time Progress**: Live updates during video generation process
- **User Authentication**: Secure sign-up/login with Supabase Auth
- **Project Management**: Dashboard with project statistics and history
- **Responsive Design**: Mobile-friendly interface with dark theme support

## Tech Stack

- **Frontend**: Next.js 15.2.4, React 19, TypeScript
- **Styling**: Tailwind CSS, Radix UI components
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **File Storage**: Vercel Blob
- **AI Services**: OpenAI API (GPT-4, TTS)
- **Video Processing**: FFmpeg.wasm (client-side)
- **Forms**: React Hook Form with Zod validation
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- OpenAI API key
- Vercel account (for Blob storage)

### Environment Variables

Create a `.env.local` file with the following variables:

\`\`\`env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Vercel Blob
BLOB_READ_WRITE_TOKEN=your_blob_token
\`\`\`

### Installation

1. Clone the repository:
\`\`\`bash
git clone https://github.com/your-username/easyshorts.git
cd easyshorts
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Set up the database:
\`\`\`bash
# Run the database setup script in your Supabase SQL editor
# or use the provided migration files
\`\`\`

4. Start the development server:
\`\`\`bash
npm run dev
\`\`\`

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

\`\`\`
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   ├── create/            # Video creation wizard
│   ├── dashboard/         # User dashboard
│   └── gallery/           # Background/video gallery
├── components/            # Reusable UI components
│   ├── ui/               # shadcn/ui components
│   └── wizard/           # Video creation wizard components
├── lib/                   # Utility libraries
│   ├── supabase/         # Supabase client configuration
│   └── utils.ts          # Helper functions
├── scripts/               # Database setup scripts
└── types/                 # TypeScript type definitions
\`\`\`

## API Endpoints

- `POST /api/generate-script` - Generate AI scripts
- `POST /api/generate-speech` - Text-to-speech conversion
- `POST /api/generate-image` - AI background generation
- `POST /api/upload-background` - Background file upload
- `POST /api/upload-video` - Video file upload
- `DELETE /api/delete-background` - Remove backgrounds
- `DELETE /api/delete-video` - Remove videos
- `GET /api/video-progress/[projectId]` - Check generation progress

## Database Schema

The application uses Supabase with the following main tables:

- **profiles**: User profile information
- **projects**: Video projects with status tracking
- **backgrounds**: User-uploaded background assets
- **generated_videos**: Final video outputs
- **Storage buckets**: File storage organization

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions, please open an issue on GitHub or contact the development team.
