# DogCareFinder API

Node.js + Express API that provides authentication and listing submission for DogCareFinder.

## Setup

1. Install dependencies:
   npm install

2. Edit `.env` with your MySQL credentials

3. Run locally:
   npm run dev

4. Deploy to Hostinger Node.js App:
   - Create Node.js app in hPanel
   - Point to this folder
   - Set startup file to `server.js`
   - Run "NPM Install" from the panel
   - Restart

## Endpoints

- `POST /api/auth/signup` — Create account
- `POST /api/auth/login` — Log in
- `POST /api/auth/logout` — Log out
- `GET  /api/auth/me` — Get current user
- `POST /api/listings/submit` — Submit a listing
- `GET  /api/listings/` — Get user's submissions
- `GET  /health` — Health check
