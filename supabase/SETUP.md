# Activate optional QR check-in

The hosted app is connected to project `pickleballque` (`bsvuxfocoroiaxhrzucb`, Singapore) as of 2026-11-08. The instructions below describe setup for a separate deployment. Manual queuing works locally without this setup.

1. Create a Supabase project on the Free plan.
2. Run `session-checkin.sql` in the project's SQL Editor. It creates private tables and four narrowly scoped RPC functions. No direct table access is granted to visitors.
3. Set `supabaseUrl` and the **publishable** key (`sb_publishable_…`) in `config.js`. These are public settings. Never use a secret or service-role key.
4. Publish these files to GitHub Pages, then test with two separate browsers: enable QR check-in on the organizer page and submit a nickname through the join link.

No player or organizer account is required in the app. Enabling QR creates a 12-hour session. The organizer's random secret stays in localStorage and is sent only in POST bodies to the configured Supabase project; the database stores its SHA-256 hash. The QR carries only the public session ID. Visitors can submit nicknames but cannot read arrivals or close sessions without the organizer secret.

The organizer page polls every five seconds while visible. Check-ins are accepted immediately in the database and appended to the local queue when received. Keep the organizer page open and connected; arrivals submitted while it is closed are retrieved when it reopens. This is an arrival inbox, not cloud backup or multi-organizer synchronization. Game state stays in the organizer's browser.

Each session accepts at most 200 distinct nickname reservations, including the initial roster. Duplicate names are rejected case-insensitively. A retry uses the same guest ID to prevent duplicate arrivals. A nickname already added manually on the organizer's browser is merged rather than duplicated. Removing a player does not free their remote nickname reservation during that QR session.

Close check-in before resetting. Closing first rejects new arrivals and then imports remaining arrivals before detaching. Reset cannot undo closing a server session. New remote arrivals clear Undo history so undo cannot erase check-ins. Clearing organizer browser storage loses control of that QR; it will expire after 12 hours.

The migration purges sessions more than seven days past expiry whenever a new session is created. There is a global 500-session capacity guard. This no-login flow is intended for small trusted groups: anyone with a QR can submit nicknames. Close a QR if it is shared beyond the intended group. A public large-scale rollout would require additional request throttling/CAPTCHA for anonymous session creation.

Free Supabase projects can pause after low activity. Resume the project in Supabase before using QR check-in again. Manual local queuing is unaffected.

## Session archives

`session-archives.sql` was added on 2026-11-09. It creates a separate private archive table plus save/list/get functions protected by a random per-browser archive key. Only the key hash is stored on the server. Archive snapshots exclude check-in secrets and are retained independently of QR expiry. This is a manual snapshot feature, not continuous backup. It does not store individual match history beyond the current state and accumulated counts.
