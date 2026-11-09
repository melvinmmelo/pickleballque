# Sideout

A pickleball doubles queue with browser storage and support for multiple courts.

Open `index.html` directly, or visit https://melvinmmelo.github.io/pickleballque/.

1. Add unique player nicknames.
2. Use **Add court** for additional courts. All courts share one arrival-order queue.
3. **Start game** assigns the first four waiting players to that court.
4. **Finish game & rotate** counts one game for each player on that court, returns them to the queue, and starts the next four. Other courts remain unchanged.
5. **Finish & free court** counts the game and returns players without starting another game. Empty extra courts can be removed.

**Up next** shows the next four waiting players for whichever court becomes available. With a single court, it also previews returning players if needed. **Skip** moves an upcoming player to the back without changing game counts; at least five available players are needed. New arrivals join at the back with zero actual games played.

Use **Remove** beside a waiting player to remove them from the list and queue after confirmation. For an on-court player, first use **Finish & free court**. Removal can be undone. **Undo last action** reverses one change until reload. **Reset session** clears the players, counts, and courts, leaving one empty court.

Data saves in localStorage in the current browser. Existing single-court sessions migrate to Court 01 with game counts and queue order preserved. Data does not sync across devices, browsers, or between the local file and hosted site. Clearing browser storage may erase the session. A warning appears when saving is unavailable.

## Custom lineup at the back

Open **Custom lineup**, select four distinct waiting players (first two on Team A, last two on Team B), then choose **Queue lineup last**. Those four move to the back as a group; earlier waiting players go first. The chosen teams stay together until their turn. If fewer than four players remain ahead, they wait for returning players or new arrivals to complete their game. The custom group does not jump ahead. Later arrivals otherwise join behind the group.

**Cancel grouping** releases the grouping without changing current queue positions; Undo reverses the last action. Skipping clears the grouping, as does removing one of the selected players. The pending group survives reloads and other games starting, and clears when its own game starts.

## Optional session QR check-in

QR check-in is connected to Supabase on the hosted site. For a separate deployment, follow the [Supabase setup](supabase/SETUP.md). Use **Enable QR check-in** on the hosted site. Arriving players scan the QR and enter a nickname with no login. Keep the organizer page open: new arrivals are appended automatically, usually within five seconds. Close check-in when finished; each QR also expires after 12 hours. Local manual entry remains available without Supabase or internet.

Development checks: run `npm ci && npm test` with Google Chrome installed. Tests use a local PostgreSQL-compatible PGlite database and isolated browsers; no live Supabase account or production player data is used.

## Save session history

Use **Save session** to take a named snapshot of the current players, completed game counts, queue, courts, and custom lineup. Each click creates a separate snapshot. Saved sessions survive **Reset session**. Use **View** to review a snapshot, or **Download copy** to export it as JSON. Viewing does not replace the current queue.

Snapshots save locally first and then back up to Supabase when available. Offline saves are labeled **Browser copy only** and provide **Back up online** for retrying. **Refresh saved list** retrieves cloud entries associated with this browser's private archive key. Clearing browser data loses that key; download important sessions beforehand. There is no account-based recovery or cross-device archive list. QR credentials are excluded from snapshots. Cloud archives are separate from expiring QR sessions and are not removed when QR sessions expire. Up to 100 snapshots per browser key can be backed up online.

For a new deployment, run `supabase/session-archives.sql` after the check-in migration.
