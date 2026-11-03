# LifeOS

A private readiness dashboard that installs on your iPhone like an app. It covers readiness from Apple Health, Oura and Eight Sleep, body composition from smart-scale screenshots, trip and concert journals, Google Calendar and voice notes.

Live at **https://life.from5to10million.com** once the Netlify setup below is done.

## How it's built

- `public/`: the app (plain HTML, CSS and JS with no build step), installable from Safari with **Share → Add to Home Screen**.
- `netlify/functions/api.mts`: the API at `/api/*`.
- `netlify/functions/oura-daily.mts`: pulls Oura every morning at 12:00 UTC (5:00 AM Mountain).
- `netlify/lib/`: storage, login, health logic, calendar, media and photo search.
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

## Connections

- **Oura**: paste a personal access token from cloud.ouraring.com/personal-access-tokens in Settings. It's stored encrypted, synced every morning, and also synced when you open the app if the last sync was more than 3 hours ago.
- **Google Calendar**: paste the calendar's *Secret address in iCal format* in Settings. It refreshes every 5 minutes.
- **Apple Health**: a Shortcuts automation POSTs each day's numbers to `/api/ingest/apple` with the key shown in Settings. You can also import the full Health export (`export.xml`) from the Health tab.
- **Eight Sleep and smart scales**: drop or paste screenshots. Only numbers visible in the screenshot are logged, to the day the screenshot shows.
