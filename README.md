# LifeOS

A private readiness dashboard that installs on your iPhone like an app. It covers readiness from Apple Health, Oura and Eight Sleep, body composition from smart-scale screenshots, trip and concert journals, personal and work calendars and voice notes.

Live at **https://life.from5to10million.com** once the Netlify setup below is done.

## How it's built

- `public/`: the app (plain HTML, CSS and JS with no build step), installable from Safari with **Share → Add to Home Screen**.
- `netlify/functions/api.mts`: the API at `/api/*`.
- `netlify/functions/daily.mts`: every morning at 12:00 UTC (5:00 AM Mountain): pulls Oura, rebuilds cards from each calendar, fetches missing header photos.
- `netlify/lib/`: storage, login, health logic, calendar, cards, media and photo search.
- **Cards build themselves.** Google copies flight, hotel, ticket and reservation emails into Google Calendar as events. `lib/cards.mts` reads the calendar, asks Claude to group the events into trips, concerts and events, creates the cards, and merges new bookings into existing trips (each card remembers its event ids). Runs on calendar connect, on app open after 6 hours, and daily. No personal data is ever committed to this repo.
- Data lives in Netlify Blobs, with every user under their own `u/<id>/` keys. Health history only grows: each import is merged into its day and recorded in that day's log. Undo is the only way a day reverts.

## Accounts

- The first person to sign up becomes the owner. After that, sign-ups are closed.
- To let someone else in, set `INVITE_CODE` in Netlify and give them the code.
- Session and encryption keys are created automatically on first run and kept in the site's private storage. Setting `SESSION_SECRET` or `ENCRYPTION_KEY` in Netlify overrides them.

## Environment variables

| Name | Needed for | Where |
|---|---|---|
| `ANTHROPIC_API_KEY` | Reading health screenshots and framing header photos | Netlify → Project configuration → Environment variables (scope: Functions) |
| `INVITE_CODE` | Optional. Lets more people create accounts. | Same |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. Turns on "Continue with Google" for calendars. Create an OAuth client (Web application) in Google Cloud Console with the redirect URI `https://<your-domain>/api/connect/google/callback`, scopes `calendar.readonly` and `userinfo.email`. Without them, people use "Sign in with iCloud" or a calendar link. | Same |

## Connections

- **Oura**: paste a personal access token from cloud.ouraring.com/personal-access-tokens in Settings. It's stored encrypted, synced every morning, and also synced when you open the app if the last sync was more than 3 hours ago.
- **Calendars**: up to six accounts, personal and work. *Continue with Google* (OAuth, every calendar on the account), *Sign in with iCloud* (Apple ID + app-specific password over CalDAV, every calendar on the account), or a private iCal link (Google, iCloud, Outlook). Merged into one view, refreshed every 5 minutes; one failing never hides the others. Tokens and passwords are stored encrypted.
- **Apple Health**: a Shortcuts automation POSTs each day's numbers to `/api/ingest/apple` with the key shown in Settings. You can also import the full Health export (`export.xml`) from the Health tab.
- **Eight Sleep and smart scales**: drop or paste screenshots. Only numbers visible in the screenshot are logged, to the day the screenshot shows.
