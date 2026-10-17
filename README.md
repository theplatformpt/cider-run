# Cider Run · Jump & Speed Contest

Live leaderboard and staff results entry for The Platform's 1st Annual Cider Run (Sat Nov 21, 2026).
Runs on Cloudflare Pages with a Cloudflare D1 database. No Airtable, so it can't use up the PPI site's Airtable calls.

| Page | Who | What |
|---|---|---|
| `/` | Everyone (QR code) | Live leaderboard: Overall, Sprint, Jump, split by age group and sex. "Find yourself" search. Refreshes every 5 s. |
| `/r/<code>` | Each athlete | Their own results card with all trials and placings, plus a "Request a PPI session" form. |
| `/tv/` | A TV or laptop at the event | Big-screen view that rotates through divisions, with the QR code. |
| `/poster/` | Print | Letter-size QR poster for the leaderboard. |
| `/staff/` | Staff (passcode) | Check in, Sprint station, Jump station, Athletes (edit/fix/delete), Setup. |

## Set it up (about 20 minutes, once)

1. **GitHub.** Create an empty repo named `cider-run` under `theplatformpt`, then upload everything in this folder (or let Claude push it).
2. **Database.** Cloudflare dashboard → Storage & Databases → D1 → Create database → name it `cider-run`.
   Open it → Console → paste all of `schema.sql` → Execute.
3. **Site.** Workers & Pages → Create → Pages → Connect to Git → pick `cider-run`.
   Framework preset: None. Build command: leave empty. Build output directory: `public`. Save and Deploy.
4. **Connect the database.** In the new Pages project → Settings → Bindings → Add → D1 database.
   Variable name `DB`, database `cider-run`. Add it for Production (and Preview if you test there).
5. **Secrets.** Settings → Variables and Secrets → add, type Secret:
   - `STAFF_PASSCODE`: the staff login, at least 8 characters.
   - `SESSION_SECRET`: any long random string (keeps staff logins secure).
   - Optional, to send PPI requests straight to GoHighLevel: `GHL_API_KEY` (a Private Integration token) and `GHL_LOCATION_ID` (the sub-account ID). Without these, requests are saved and downloadable from Setup.
6. **Redeploy** (Deployments → latest → Retry deployment). Secrets and bindings only take effect on a new deploy.
7. **Domain.** (Any visit to `cider-run.pages.dev` now forwards to the custom domain automatically.)
    Pages project → Custom domains → add `cider.theplatformpt.com`. In Hostinger DNS add the CNAME record Cloudflare shows (`cider` → `cider-run.pages.dev`), same as the knee site.

## Before the event

- Log in at `/staff/`, check in a few fake athletes, enter results, look at `/`, `/tv/` and a results card.
- Setup → **Clear test data** (type RESET) when done.
- Setup → set sprint distance and age groups. You can change them later; the board regroups instantly.
- Print the poster from `/poster/` once the custom domain works, so the QR points to the real address.
- Optional: turn off "Show results on the public board" until testing starts.

## On the day

- **Check-in table:** Check in tab. Each athlete gets an athlete number automatically (or type your own). It's only a lookup number: write it on their hand or a name sticker so stations can find them fast. No race bibs needed. The screen shows a QR the athlete scans to follow their own results.
- **Sprint station / Jump station:** type the athlete # (or name), press Enter, type trial 1, Enter, trial 2, Enter… Enter on an empty box saves. Only trial 1 is required. Sprint and jump can be entered on different phones at the same time for the same athlete without overwriting each other.
- **Mistakes:** Athletes tab → tap the row → fix any trial, name, age or sex → Save. Delete is there too.
- **After:** Setup → Results CSV (every trial, best marks, placings, contact info, results links) and PPI requests CSV.

## How scoring works

- Best of up to 3 trials counts: lowest sprint time, highest jump.
- Divisions are age group × sex. Default groups: 10 & under, 11–13, 14–17, 18–34, 35–49, 50+.
- Places use competition ranking: a tie shares a place (1, 2, 2, 4).
- Overall = average of the athlete's sprint and jump percentile within their division (share of the division they beat, ties count half; a division of one gets 100). Needs both tests. Public pages show the overall **place** only, never the number, so last place never reads as "0". The number is in the staff Results CSV.
- Public pages show first name + last initial and athlete # only. Emails, phones and results links are staff-only.

## Capacity

The public board reads one pre-computed row per refresh, and phones skip the download when nothing has changed.
100 phones refreshing for 3 hours is roughly 200,000 row reads against D1's free 5 million per day.

## Files

- `schema.sql`: database tables (safe to run twice).
- `functions/`: the server: `api/board`, `api/result/<code>`, `api/lead`, `api/login`, and `api/staff/*` (passcode only).
- `lib/scoring.js`: all leaderboard math. `lib/board.js`: rebuilds the public snapshot after every change.
- `public/`: the pages. Colors and shapes match the Cider Run promo email; logo files are from The Platform brand kit.
