# EasyShorts - AI Video Creator

[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app)

## Overview

EasyShorts is an AI-powered video creation platform that transforms text ideas into engaging TikTok and YouTube Shorts. The application combines AI script generation, voice synthesis, and automated video composition to create viral-ready content through a streamlined web interface.

## How It Works

1. **Script Generation**: AI generates engaging scripts optimized for short-form content using OpenAI GPT-4
2. **Voice Synthesis**: Converts scripts to natural-sounding speech with multiple voice options
3. **Background Selection**: Users can upload custom backgrounds or generate AI images
4. **Video Assembly**: Client-side FFmpeg processing combines audio, background, and captions into final video
5. **Export & Share**: Generated videos are stored and available for download or sharing

## Technical Architecture

### Frontend
- **Next.js 15** with App Router and React 19
- **TypeScript** for type safety
- **Tailwind CSS** with Radix UI components for styling
- **Client-side video processing** using FFmpeg.wasm

### Backend & Services
- **Supabase** for authentication and PostgreSQL database
- **Vercel Blob** for file storage
- **OpenAI API** for script generation and text-to-speech
- **Real-time progress tracking** during video generation

### Video Processing Pipeline
- Audio generation from script text
- Background image processing and scaling
- Time-synchronized caption generation
- Client-side video composition with FFmpeg
- Automatic upload to cloud storage

## Key Features

- **AI Script Generation** - Context-aware content creation
- **Multi-voice TTS** - Natural speech synthesis
- **Custom Backgrounds** - Upload or AI-generate backgrounds
- **Real-time Captions** - Synchronized text overlays
- **Project Management** - Dashboard with creation history
- **Responsive Design** - Mobile-optimized interface

## Database Schema

- **profiles** - User account information
- **projects** - Video project metadata and settings
- **backgrounds** - User-uploaded and AI-generated backgrounds
- **generated_videos** - Final video outputs with metadata

## API Architecture

RESTful API endpoints handle:
- Script generation (`/api/generate-script`)
- Speech synthesis (`/api/generate-speech`) 
- Background management (`/api/upload-background`)
- Video processing (`/api/upload-video`)
- Progress tracking (`/api/video-progress`)

The application uses a wizard-based interface that guides users through project setup, script creation, voice selection, background choice, and final video generation with real-time progress updates.
