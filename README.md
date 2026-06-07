# Chatflow Backend

Chatflow Backend is a real-time chat backend built with Node.js,
Express, Socket.IO, PostgreSQL, and Supabase Storage.

It supports private messaging, group messaging, media uploads, read
receipts, online presence tracking, and JWT-based authentication.

## Why I Built This

I built Chatflow Backend as a customizable communication backend for
institutions such as schools, businesses, and organizations that need
their own messaging system.

The goal is to provide a backend that can support:

- Internal communication between staff or employees
- Student-to-student and student-to-teacher messaging
- Customer or member support chat
- Private and group conversations with media sharing

## Features

- Real-time private and group messaging with Socket.IO
- Image, video, audio, and file message support
- JWT-based authentication middleware
- PostgreSQL database with connection pooling
- Supabase Storage integration for uploaded media
- Signed file download URLs
- Read receipts
- Online user tracking
- REST API built with Express.js

## Tech Stack

- Node.js
- Express.js
- Socket.IO
- PostgreSQL with `pg`
- Supabase Storage
- JWT
- Multer
- FFmpeg utilities for media processing

## Docker

Build the backend image from this folder:

```bash
docker build -t chatflow-backend .
```

Run it with an env file:

```bash
docker run --rm -p 5500:5500 --env-file .env chatflow-backend
```

Required environment variables are shown in `.env.example`.

For a hosted Postgres database such as Supabase, keep the default SSL behavior.
For a local Postgres database that does not support SSL, set:

```bash
DATABASE_SSL=false
```

If Postgres is running directly on your Windows host and the backend is running
inside Docker, use `host.docker.internal` in `DATABASE_URL`.

## Roadmap

Features planned for upcoming releases:

- Audio and video calling (WebRTC-based, peer-to-peer)
- Discord-style rooms — persistent topic-based channels
  for communities and organizations
- Group video calls
- Message reactions and threading
- End-to-end encryption
