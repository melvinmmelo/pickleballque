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

## Custom next game

Open **Custom lineup** under **Up next**, select four distinct waiting players (first two on Team A, last two on Team B), and choose **Use lineup**. The next court started or rotated uses that lineup once; the remaining players retain their queue order. On-court players cannot be selected. **Use normal queue** cancels the override. Skipping a player clears it, as does removing a selected player. The selection saves across reloads and supports Undo. Finishing and freeing a court keeps the planned lineup for the next start.

## Optional session QR check-in

QR check-in is connected to Supabase on the hosted site. For a separate deployment, follow the [Supabase setup](supabase/SETUP.md). Use **Enable QR check-in** on the hosted site. Arriving players scan the QR and enter a nickname with no login. Keep the organizer page open: new arrivals are appended automatically, usually within five seconds. Close check-in when finished; each QR also expires after 12 hours. Local manual entry remains available without Supabase or internet.

Development checks: run `npm ci && npm test` with Google Chrome installed. Tests use a local PostgreSQL-compatible PGlite database and isolated browsers; no live Supabase account or production player data is used.
