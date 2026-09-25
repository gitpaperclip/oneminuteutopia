# One Minute Utopia

One Minute Utopia is a camera-first civic reporting prototype built for HopHacks
2026. A resident photographs a public issue, receives a server-generated AI
assessment, confirms the location and details, and saves a durable report. Nearby
reports of the same issue can be grouped into one stronger community signal.

No account is required. The current project is a Baltimore-focused demonstration;
it does **not** submit to Baltimore 311, dispatch emergency services, or promise a
government response.

App Overview: https://www.youtube.com/watch?v=h1_vjCUnr1c&feature=youtu.be

In-App Reporting Demo: https://www.youtube.com/watch?v=iHo--PBsX2g

One Minute Utopia is an AI-assisted 311 reporting tool built for HopHacks 2026. The goal of the project is simple: make reporting things like potholes, broken streetlights, litter, and damaged sidewalks much faster. It also proposes infrastructure to optimize the backend for city use.

## How it works

1. Take a photo of a public issue or upload one from your device.
2. The app analyzes the image and identifies what is wrong.
3. It suggests a 311 category and generates a short description.
4. Location is added automatically when available, or can be entered manually.
5. The user reviews the information and submits the report.

If the AI cannot confidently analyze the image, the user can still complete the report manually.

## Features

- Camera-first reporting
- AI-generated issue classification and description
- Automatic location capture
- Baltimore 311 category matching
- Report review before submission
- Public map of reported issues
- Grouping of nearby reports for the same problem
- “I see this too” confirmations from other users
- Manual reporting fallback if AI analysis fails

## Report grouping

If multiple people report the same issue nearby within a short period of time, the app can group those reports together.

This helps show that an issue has been independently reported by multiple people instead of displaying several duplicate reports.

## Tech stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **AI:** Gemini through Google Vertex AI
- **Database:** Supabase Postgres
- **Image storage:** Supabase Storage
- **Map:** Leaflet + OpenStreetMap

## Baltimore 311 integration

The app maps detected issues to Baltimore 311 service categories and prepares the information needed for a city report. Because Baltimore does not expose a public write API that this prototype can safely use, the user still reviews and completes the final submission through the official city reporting system. The project also includes mock government websites used during the hackathon to demonstrate what an automated submission flow could look like. These are only for testing and demonstration and do not submit anything to Baltimore.

## Privacy

Reports may contain photos, locations, and descriptions of public spaces. Users should avoid uploading images containing faces, license plates, private interiors, medical information, or other sensitive information.

The server strips image metadata before storing uploaded photos.

## Local development

Requires Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure the required Supabase and Google Cloud environment variables in `.env.local`.

Then open:

```text
http://localhost:3000
```

Camera and location permissions generally require HTTPS on a physical phone.

## Verification

Before demoing the project, make sure:

1. Photo analysis works.
2. Submitted reports persist after refreshing.
3. Nearby duplicate reports are grouped.
4. Reports appear on the map.
5. Manual reporting still works if AI analysis fails.

## License

MIT
