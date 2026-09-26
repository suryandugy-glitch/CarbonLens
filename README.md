# CarbonLens — Vercel-ready campus carbon intelligence

## Features
- Personal + campus footprint dashboards, trends, category breakdowns, benchmark comparison
- Travel, electricity, food and waste logging with prototype emission factors and cited sources
- Ranked CO2e-saving recommendations
- Challenges with tracked savings
- Hostel / department / team leaderboard
- Electricity bill OCR and trip CSV import
- PDF sustainability report and CSV export
- One-click persistent light/dark mode
- Login page with demo accounts and local account creation
- QR generation + QR image upload/scanning, with three bundled demo QR images in `demo_qr/`
- Optional local camera face enrollment + verification using face-api.js; face templates remain in browser storage
- Optional browser location tracking with Google Maps link/embed

## Demo accounts
- Student: `student@carbonlens.app` / `carbon123`
- Admin: `admin@carbonlens.app` / `admin123`

## Important deployment notes
This is a static Vercel demo. Accounts are stored locally in the browser and are not a secure multi-device identity system. For production authentication, connect Supabase, Firebase Authentication, or another managed auth/database service.

Camera and geolocation require HTTPS (Vercel provides this) and explicit browser permission. Face recognition model files are loaded from the public face-api.js model host at runtime. No face image is uploaded by this app.

Google Maps is implemented in simple URL/embed mode. Advanced Google Maps JavaScript API features can be added with a Vercel environment variable and an API key restricted by domain.

## Run locally
```bash
python -m http.server 4173
```
Then open `http://localhost:4173`.

## Vercel
Import the repository/folder into Vercel. No build command is required; the project is static.
