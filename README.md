# One Minute Utopia

Camera-first civic infrastructure reporting for mobile devices. Built for HopHacks 2026.

## Overview

One Minute Utopia is a Next.js application that enables community members to quickly report civic infrastructure issues (litter, road damage, obstructions) using their phone camera. Reports are analyzed by Google Gemini AI and organized into an incident management system for community coordinators.

**Key Features:**
- 📱 Mobile-first camera capture with rear camera prioritization
- 🤖 AI-powered image analysis and categorization (Google Gemini)
- 📍 GPS location capture with manual fallback
- 🔐 Organizer passphrase authentication for coordinator inbox
- ☁️ Serverless deployment on Vercel with Postgres + Blob storage

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Vercel Postgres (serverless PostgreSQL via Neon)
- **File Storage**: Vercel Blob (image uploads)
- **AI**: Google Gemini 2.0 Flash
- **Deployment**: Vercel
- **Styling**: Tailwind CSS 4

> **Note**: Vercel Postgres has transitioned to Neon. Existing databases were automatically migrated. For new projects, Vercel will provision a Neon Postgres database when you add the Postgres integration. The `@vercel/postgres` package still works and is used by this project.

## Prerequisites

- Node.js 20+ 
- A Vercel account
- A Google AI (Gemini) API key ([get one here](https://aistudio.google.com/apikey))

## Deploying to Vercel

### 1. Fork or Clone the Repository

```bash
git clone https://github.com/gitpaperclip/oneminuteutopia.git
cd oneminuteutopia
```

### 2. Deploy to Vercel

#### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your GitHub repository
4. Vercel will auto-detect Next.js settings
5. Click "Deploy" (don't set environment variables yet)

#### Option B: Deploy via CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### 3. Add Vercel Postgres Storage

1. In your Vercel project dashboard, go to the **Storage** tab
2. Click **Create Database** → **Postgres**
3. Choose a region close to your users
4. Click **Create**
5. Vercel will automatically add the required environment variables to your project

### 4. Add Vercel Blob Storage

1. In the **Storage** tab, click **Create Database** → **Blob**
2. Click **Create**
3. Vercel will automatically add `BLOB_READ_WRITE_TOKEN` to your environment variables

### 5. Set Required Environment Variables

Go to **Settings** → **Environment Variables** and add:

| Variable | Value | Description |
|----------|-------|-------------|
| `GEMINI_API_KEY` | Your Gemini API key | Required for AI image analysis |
| `ORGANIZER_PASSPHRASE` | Your secure passphrase | Coordinator login password |
| `SESSION_SECRET` | Random 32+ char string | Session cookie signing |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Your app's URL |

**Note**: `POSTGRES_*` and `BLOB_READ_WRITE_TOKEN` are automatically set by Vercel Storage.

#### Generate a secure SESSION_SECRET:

```bash
openssl rand -base64 32
```

### 6. Redeploy

After adding environment variables, trigger a new deployment:

```bash
vercel --prod
```

Or use the Vercel dashboard: **Deployments** → **Redeploy**.

### 7. Database Initialization

The database tables are created automatically on first use. No manual migration needed!

When the first API request hits the database, the `DatabaseService.ensureTablesExist()` method will create all required tables and indexes.

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

# Edit .env.local with your keys
# - Add your GEMINI_API_KEY
# - Set ORGANIZER_PASSPHRASE
# - Generate SESSION_SECRET
# - Add Vercel Storage credentials (see below)
```

### Local Development with Vercel Storage

To develop locally with the same Postgres and Blob storage as production:

```bash
# Install Vercel CLI
npm i -g vercel

# Link to your Vercel project
vercel link

# Pull environment variables (including storage credentials)
vercel env pull .env.local

# Start development server
npm run dev
```

Visit `http://localhost:3000`

**Important**: The camera feature requires HTTPS. To test camera on mobile locally:

1. Use Vercel's preview deployment: `vercel dev` (provides HTTPS tunnel)
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

### Rate Limiting
- **Uploads**: 10 per hour per session
- **Submissions**: 20 per hour per session
- **Login Attempts**: 5 attempts, then 15-minute lockout

Rate limits are stored in-memory and reset on deployment. For production scale, consider Redis.

### Image Processing
- Max file size: 10MB
- Supported formats: JPEG, PNG, WebP
- Images stored on Vercel Blob (CDN-backed, public URLs)

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

See [.env.example](.env.example) for the complete list.

**Required**:
- `GEMINI_API_KEY`
- `ORGANIZER_PASSPHRASE`
- `SESSION_SECRET`
- `NEXT_PUBLIC_APP_URL`

**Auto-set by Vercel Storage**:
- `POSTGRES_URL` (and related)
- `BLOB_READ_WRITE_TOKEN`

## Project Structure

```
app/
  api/
    auth/login/      # Organizer authentication
    incidents/       # Incident list for coordinators
    submit/          # Report submission
    upload/          # Image upload + AI analysis
  coordinator/       # Coordinator inbox (protected)
  receipt/[id]/      # Submission confirmation page
  page.tsx           # Main reporting interface
lib/
  db.ts              # Postgres database service
  storage.ts         # Vercel Blob storage service
  gemini.ts          # AI analysis service
  session.ts         # Session management
```

## Troubleshooting

### "Failed to process image" error

If you see this error during photo upload, it typically means one of the required services is not configured:

1. **Photo storage is not configured (BLOB_READ_WRITE_TOKEN)**
   - Go to your Vercel project → Storage tab
   - Create a Blob storage if you haven't already
   - Redeploy your application
   - Verify it's working: visit `https://your-app.vercel.app/api/health`

2. **Database is not configured**
   - Go to your Vercel project → Storage tab
   - Create a Postgres database if you haven't already
   - Redeploy your application
   - Verify it's working: visit `https://your-app.vercel.app/api/health`

3. **Use the health check endpoint**
   ```
   curl https://your-app.vercel.app/api/health
   ```
   This will show which services are properly configured.

### Camera not working on iPhone
- Ensure you're accessing via **HTTPS** (Vercel provides this)
- Check that Safari has camera permissions: Settings → Safari → Camera
- Try uploading a photo instead (always works)

### Database connection errors
- Verify `POSTGRES_URL` is set (added by Vercel Storage)
- Check Vercel Storage dashboard for database status
- Tables are auto-created on first use

### Image upload fails
- Verify `BLOB_READ_WRITE_TOKEN` is set (added by Vercel Storage)
- Check file size (max 10MB)
- Check Vercel Blob dashboard for storage quota

### AI analysis returns null
- Verify `GEMINI_API_KEY` is valid
- Check Gemini API quotas in Google AI Studio
- Analysis timeout is 8 seconds (images are still saved)

## Roadmap

**Phase 1 (Current)**: Core reporting + coordinator inbox
- ✅ Mobile camera capture
- ✅ AI categorization
- ✅ Postgres + Blob storage
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
