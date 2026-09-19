# One Minute Utopia

Camera-first civic infrastructure reporting for mobile devices. Built for HopHacks 2026.

## Overview

One Minute Utopia is a Next.js application that enables community members to quickly report civic infrastructure issues (litter, road damage, obstructions) using their phone camera. Reports are analyzed by Google Gemini AI and organized into an incident management system for community coordinators.

**Key Features:**
- 📱 Mobile-first camera capture with rear camera prioritization
- 🤖 AI-powered image analysis and categorization (Google Gemini)
- 📍 GPS location capture with manual fallback
- 🔐 Organizer passphrase authentication for coordinator inbox
- ☁️ Serverless deployment on Vercel with **Supabase** (Postgres + Storage)

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase Postgres (serverless PostgreSQL)
- **File Storage**: Supabase Storage (public bucket for report photos)
- **AI**: Google Gemini 2.0 Flash
- **Deployment**: Vercel
- **Styling**: Tailwind CSS 4

## Prerequisites

- Node.js 20+ 
- A Vercel account
- A Supabase account ([supabase.com](https://supabase.com))
- A Google AI (Gemini) API key ([get one here](https://aistudio.google.com/apikey))

## Deploying to Vercel with Supabase

### 1. Set Up Supabase Project

#### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Enter project details:
   - **Name**: `1minuteutopia` (or your preferred name)
   - **Database Password**: Save this password securely (you'll need it for `DATABASE_URL`)
   - **Region**: Choose a region close to your users (e.g., `us-west-2`)
4. Wait for the project to finish setting up (~2 minutes)

#### Create Storage Bucket

1. In your Supabase dashboard, go to **Storage**
2. Click **New bucket**
3. Bucket name: `report-photos`
4. Set **Public bucket**: ✅ Enabled (allows public read access for report receipts)
5. Click **Create bucket**

> **Note**: The storage bucket is automatically created by the app on first upload if it doesn't exist. This step is optional but recommended for validation.

#### Get Your Supabase Credentials

You'll need these values for Vercel environment variables:

1. **Project URL**: Go to **Project Settings** → **API**
   - Copy the **Project URL** (e.g., `https://obvqhywolewuipftfgd.supabase.co`)

2. **API Keys**: In the same **API** section:
   - Copy **anon/public** key (for `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - Copy **service_role** key (for `SUPABASE_SERVICE_ROLE_KEY`) ⚠️ Keep this secret!

3. **Database Password**: Go to **Project Settings** → **Database**
   - Under **Connection string**, select **URI**
   - Copy the full connection string (it includes your password)
   - Format: `postgres://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

### 2. Deploy to Vercel

#### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New Project**
3. Import your GitHub repository (`oneminuteutopia`)
4. Vercel will auto-detect Next.js settings
5. Click **Deploy** (don't set environment variables yet)

#### Option B: Deploy via CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### 3. Set Environment Variables in Vercel

Go to your Vercel project → **Settings** → **Environment Variables** and add:

#### Supabase Configuration (Required)

| Variable | Value | Where to Find |
|----------|-------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://obvqhywolewuipftfgd.supabase.co` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` (your anon key) | Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` (your service key) | Project Settings → API → service_role key ⚠️ |
| `DATABASE_URL` | `postgres://postgres:[PASSWORD]@db.obvqhywolewuipftfgd.supabase.co:5432/postgres?sslmode=require` | Project Settings → Database → Connection string (add `?sslmode=require`) |

⚠️ **Important**: The `DATABASE_URL` must include `?sslmode=require` at the end for Supabase Postgres.

#### Application Configuration (Required)

| Variable | Value | Description |
|----------|-------|-------------|
| `GEMINI_API_KEY` | Your Gemini API key | Get from [Google AI Studio](https://aistudio.google.com/apikey) |
| `ORGANIZER_PASSPHRASE` | Your secure passphrase | Set your own coordinator login password |
| `SESSION_SECRET` | Random 32+ char string | Generate with: `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Your Vercel app URL |

### 4. Remove Legacy Vercel Storage Variables (If Migrating)

If you previously used Vercel Postgres (Neon) or Vercel Blob, **remove these old variables** from Vercel:

- ❌ `POSTGRES_URL`
- ❌ `POSTGRES_PRISMA_URL`
- ❌ `POSTGRES_URL_NO_SSL`
- ❌ `POSTGRES_URL_NON_POOLING`
- ❌ `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`
- ❌ `BLOB_READ_WRITE_TOKEN`
- ❌ `BLOB_STORE_ID`
- ❌ `BLOB_READ_WRITE_TOKEN_STORE_ID`

> **Why?** The app prioritizes Supabase variables (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`) but will fall back to legacy Vercel variables if both are present. Remove old variables to ensure a clean cutover.

### 5. Redeploy

After setting environment variables, trigger a new deployment:

```bash
vercel --prod
```

Or use the Vercel dashboard: **Deployments** → **Redeploy**.

### 6. Database Initialization

The database tables are created automatically on first use. No manual migration needed!

When the first API request hits the database, the `DatabaseService.ensureTablesExist()` method will create all required tables and indexes.

### 7. Verify Deployment

Visit your app's `/api/health` endpoint to verify configuration:

```bash
curl https://your-app.vercel.app/api/health
```

Expected response:
```json
{
  "status": "ok",
  "checks": {
    "supabase_database": true,
    "supabase_storage": true,
    "ai_analysis": true
  },
  "message": "All required services are configured"
}
```

## Using the Application

### For Community Members (Reporting)

1. Open the app on your iPhone/Android phone: `https://your-app.vercel.app`
2. Grant camera and location permissions when prompted
   - **Camera**: Required for photo capture
   - **Location**: Optional but recommended (can enter address manually)
3. Tap **Take Photo** to use the camera (rear camera on mobile)
   - Or tap **Upload Photo** to select from gallery
4. Review the AI-generated category and description
5. Adjust details if needed
6. Tap **Submit Report**
7. Save your Report ID from the receipt page

**Note**: The camera feature requires HTTPS. Vercel provides HTTPS automatically for all deployments.

### For Coordinators (Inbox)

1. Navigate to: `https://your-app.vercel.app/coordinator`
2. Enter the organizer passphrase you set in environment variables
3. View all submitted incidents with photos
4. Click an incident to see full details
5. Export incident reports as JSON for municipal submission

## Local Development

### Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```bash
# Supabase (get from dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://obvqhywolewuipftfgd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
DATABASE_URL=postgres://postgres:[PASSWORD]@db.obvqhywolewuipftfgd.supabase.co:5432/postgres?sslmode=require

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key_here

# Application
ORGANIZER_PASSPHRASE=your_secure_passphrase_here
SESSION_SECRET=your_random_32_char_string_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

**Important**: The camera feature requires HTTPS. To test camera on mobile locally:

1. Use `vercel dev` (provides HTTPS tunnel)
2. Or use ngrok: `ngrok http 3000` and access via the HTTPS URL

## Camera Compatibility

### ✅ Works Great
- iPhone Safari (iOS 11+)
- Android Chrome (Android 5+)
- Mobile browsers with rear camera

### ⚠️ Limited Support
- Desktop browsers (no rear camera, often no camera at all)
- Windows laptops (integrated cameras often fail or have permission issues)

**Fallback**: The app always provides a file upload option when camera access fails or is unavailable.

## Architecture Notes

### Storage Configuration

- **Bucket**: `report-photos` (public read access)
- **Max file size**: 10MB
- **Supported formats**: JPEG, PNG, WebP, HEIC, HEIF
- **Access**: Public URLs for report receipts and coordinator inbox
- **Auto-creation**: Bucket is created automatically on first upload if it doesn't exist

### Rate Limiting

- **Uploads**: 10 per hour per session
- **Submissions**: 20 per hour per session
- **Login Attempts**: 5 attempts, then 15-minute lockout

Rate limits are stored in-memory and reset on deployment. For production scale, consider Redis.

### Database Schema

- `sessions`: User and organizer sessions
- `reports`: Individual submissions with photos
- `incidents`: Aggregated issues (may have multiple reports)
- `status_events`: Incident status change audit log

### AI Analysis

- Model: Gemini 2.0 Flash
- Timeout: 8 seconds
- Categories: litter, path_obstruction, road_damage, other
- Returns: category, description, confidence, routing suggestion

## Environment Variables Reference

See [.env.example](.env.example) for the complete list with detailed comments.

**Required**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (with `?sslmode=require`)
- `GEMINI_API_KEY`
- `ORGANIZER_PASSPHRASE`
- `SESSION_SECRET`
- `NEXT_PUBLIC_APP_URL`

## Project Structure

```
app/
  api/
    auth/login/      # Organizer authentication
    health/          # Health check endpoint (Supabase readiness)
    incidents/       # Incident list for coordinators
    media/           # Image proxy for Supabase Storage
    submit/          # Report submission
    upload/          # Image upload + AI analysis
  coordinator/       # Coordinator inbox (protected)
  receipt/[id]/      # Submission confirmation page
  page.tsx           # Main reporting interface
lib/
  db.ts              # Supabase Postgres database service
  storage.ts         # Supabase Storage service
  gemini.ts          # AI analysis service
  session.ts         # Session management
```

## Troubleshooting

### Camera not working on iPhone
- Ensure you're accessing via **HTTPS** (Vercel provides this)
- Check that Safari has camera permissions: Settings → Safari → Camera
- Try uploading a photo instead (always works)

### Database connection errors
- Verify `DATABASE_URL` is set with `?sslmode=require` at the end
- Check that your Supabase project is active in the dashboard
- Verify the database password is correct
- Tables are auto-created on first use

### Image upload fails
- Verify all Supabase environment variables are set
- Check that the `report-photos` bucket exists in Supabase Storage
- Verify bucket is set to **public** for read access
- Check file size (max 10MB)

### AI analysis returns null
- Verify `GEMINI_API_KEY` is valid
- Check Gemini API quotas in Google AI Studio
- Analysis timeout is 8 seconds (images are still saved)

### Health check shows degraded status
- Visit `/api/health` to see which services are not configured
- Verify all required environment variables are set in Vercel
- Redeploy after adding missing variables

## Migration from Vercel Postgres/Blob

If you're migrating from Vercel Postgres (Neon) and Vercel Blob:

1. **Set up Supabase** following the steps above
2. **Add Supabase environment variables** to Vercel (keep old ones temporarily)
3. **Deploy** the new version
4. **Test** that everything works with Supabase
5. **Remove old Vercel storage variables** (listed in step 4 above)
6. **Final redeploy** to ensure clean cutover

The app will prefer Supabase variables over legacy Vercel variables, so you can test with both present.

## Roadmap

**Phase 1 (Current)**: Core reporting + coordinator inbox
- ✅ Mobile camera capture
- ✅ AI categorization
- ✅ Supabase Postgres + Storage
- ✅ Coordinator authentication

**Phase 2 (Future)**:
- 🔜 Interactive map view
- 🔜 Status updates
- 🔜 Public API for municipal integration
- 🔜 Email notifications

## Contributing

This is a hackathon project. Feel free to fork and adapt!

## License

MIT
