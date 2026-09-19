# One Minute Utopia - Phase 1 MVP

Camera-first civic reporting product for HopHacks 2026. Built with Next.js, React, Tailwind CSS, and Gemini AI.

## Product Promise

Resident opens a web link → takes/uploads a photo → confirms short label + location → submits → durable receipt. Anonymous by default. Organizer gets a protected inbox of usable reports.

## What Works (Phase 1)

1. ✅ Responsive web entry with camera capture and upload
2. ✅ Browser location request with manual address fallback
3. ✅ Server-side Gemini image analysis (category, description, confidence, routing)
4. ✅ Review screen with photo, label, location, and optional details
5. ✅ Durable submission with receipt ID and report page
6. ✅ Protected coordinator inbox with photos, categories, and exportable reports
7. ✅ SQLite persistent storage, rate limiting, session management

## Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Database**: SQLite (better-sqlite3) with durable persistence
- **AI**: Google Gemini 2.0 Flash for image analysis
- **Storage**: Local filesystem (production would use S3/R2)
- **Authentication**: Session-based with organizer passphrase

## Setup

### Prerequisites

- Node.js 18+ and npm
- Gemini API key (get from [Google AI Studio](https://makersuite.google.com/app/apikey))

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd <repo-directory>
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file (copy from `.env.example`):
```bash
cp .env.example .env.local
```

4. Set required environment variables in `.env.local`:
```env
GEMINI_API_KEY=your_actual_gemini_api_key
ORGANIZER_PASSPHRASE=your_secure_passphrase
```

### Running Locally

1. Start the development server:
```bash
npm run dev
```

2. Open [http://localhost:3000](http://localhost:3000) in your browser

3. To access the coordinator inbox:
   - Go to [http://localhost:3000/coordinator](http://localhost:3000/coordinator)
   - Enter the organizer passphrase (default: value from `ORGANIZER_PASSPHRASE` env var)

## Project Structure

```
/workspace
├── app/                      # Next.js app directory
│   ├── page.tsx             # Main reporting page (capture + review)
│   ├── receipt/[id]/        # Receipt page after submission
│   ├── coordinator/         # Protected organizer inbox
│   └── api/                 # API routes
│       ├── upload/          # Image upload + AI analysis
│       ├── submit/          # Report submission
│       ├── auth/login/      # Organizer authentication
│       └── incidents/       # Get all incidents (protected)
├── lib/                     # Core services
│   ├── db.ts               # Database schema and operations
│   ├── gemini.ts           # Gemini AI integration
│   ├── storage.ts          # Image storage
│   └── session.ts          # Session management
├── data/                    # SQLite database (gitignored)
├── uploads/                 # Uploaded images (gitignored)
└── .env.example            # Environment variables template
```

## Environment Variables

Required variables (see `.env.example` for full list):

- `GEMINI_API_KEY` - Google Gemini API key for image analysis
- `ORGANIZER_PASSPHRASE` - Shared passphrase for coordinator login (hackathon fallback)
- `DATABASE_PATH` - Path to SQLite database file (default: `./data/app.db`)
- `NODE_ENV` - Environment mode (`development` or `production`)

## Features

### For Residents

- **Anonymous reporting**: No account required, session-based tracking
- **Camera-first**: Direct camera capture with rear camera on mobile
- **Upload fallback**: Works with any image from gallery/files
- **Location aware**: GPS location with manual address fallback
- **AI assistance**: Automatic categorization and description
- **Manual correction**: User can override AI suggestions
- **Durable receipt**: Unique report ID and status tracking

### For Coordinators

- **Protected access**: Passphrase-based authentication
- **Visual inbox**: Grid view of all incidents with photos
- **Detailed view**: Full incident information with all evidence
- **Export reports**: Download structured JSON for municipal handoff
- **Copy to clipboard**: Quick sharing of incident details
- **Rate limiting**: Protection against abuse

### Categories

- **Litter / Debris**: Trash, scattered waste
- **Path Obstruction**: Blocked sidewalks or pedestrian access
- **Road Damage**: Potholes, cracks, damaged pavement
- **Other Issue**: Issues that don't fit standard categories

## AI Analysis

Gemini 2.0 Flash analyzes uploaded images and provides:

- Category classification (with confidence score)
- Short label (5-8 word description)
- Full description (2-3 sentences of observable facts)
- Hazard detection
- Community action candidacy
- Routing suggestion (municipal/community/review)

**Important**: AI analysis has an 8-second timeout. If it fails, manual reporting still works.

## Data Model

### Reports
Individual submissions from residents with image, location, and AI analysis.

### Incidents
Shared issue records that can consolidate multiple reports (Phase 2+ feature, currently 1:1).

### Sessions
Anonymous session tracking with rate limiting and organizer role support.

### Status Events
Audit log of status changes (prepared for Phase 3 workflow).

## Security

- **Session-based auth**: HttpOnly cookies, no client-side tokens
- **Rate limiting**: Upload, submission, and login attempt limits
- **Authorization checks**: Server-side validation on all protected routes
- **No secrets in repo**: All credentials via environment variables
- **No secrets in client**: Passphrase and DB access server-only

## Deployment Considerations

For production deployment:

1. Replace SQLite with PostgreSQL or similar production database
2. Use object storage (S3, R2, etc.) instead of local filesystem
3. Add HTTPS (required for geolocation and camera)
4. Set strong `ORGANIZER_PASSPHRASE`
5. Configure proper CORS and security headers
6. Add monitoring and error tracking
7. Consider SpacetimeDB for real-time features (Phase 2)

## Testing

### Manual Testing Checklist

- [ ] Camera capture works on mobile device
- [ ] Upload works from desktop
- [ ] Location permission request appears
- [ ] Manual address entry works when location denied
- [ ] AI analysis provides category and description
- [ ] Manual category selection works
- [ ] Report submission creates receipt
- [ ] Receipt page shows correct information
- [ ] Coordinator login requires passphrase
- [ ] Coordinator can see submitted reports
- [ ] Export report downloads JSON file
- [ ] Copy to clipboard works

## Known Limitations (Phase 1)

- **No live updates**: Coordinator must refresh to see new reports
- **No map view**: List-only interface (map planned for Phase 2)
- **No duplicate detection**: Each submission creates new incident
- **No status updates**: Workflow transitions planned for Phase 3
- **No account system**: Optional accounts planned for Phase 2
- **No municipal integration**: Export-only, direct submission is future work
- **Local storage**: Filesystem and SQLite (production needs cloud storage)

## Phase 2+ Features (Not Yet Implemented)

- Real-time incident map with SpacetimeDB subscriptions
- Duplicate/nearby incident detection and consolidation
- Optional resident accounts with report history
- Public incident viewing and filtering
- Credibility scoring and corroboration
- Live status updates across devices

## Phase 3+ Features (Not Yet Implemented)

- Community action workflow
- Organizer-approved cleanup tasks
- Before/after documentation
- Event scheduling and coordination
- Volunteer participation tracking

## License

Built for HopHacks 2026. See repository for license details.

## Credits

- Gemini 2.0 Flash for AI image analysis
- Next.js and React for the framework
- Tailwind CSS for styling
- better-sqlite3 for local persistence

---

**Note**: This is a Phase 1 MVP built for a hackathon. Production deployment would require additional security hardening, scalability improvements, and infrastructure changes.
