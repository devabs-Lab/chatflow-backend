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
