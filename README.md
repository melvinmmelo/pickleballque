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

Development checks: run `npm ci && npm test` with Google Chrome installed. When you change a script or stylesheet, bump its `?v=` value in `index.html`, `player.html`, and `join.html` so browsers do not combine a new page with a stale cached script. Tests use a local PostgreSQL-compatible PGlite database and isolated browsers; no live Supabase account or production player data is used.

## Save session history

Use **Save session** to take a named snapshot of the current players, completed game counts, queue, courts, and custom lineup. Each click creates a separate snapshot. Saved sessions survive **Reset session**. Use **View** to review a snapshot, or **Download copy** to export it as JSON. Viewing does not replace the current queue.

Snapshots save locally first and then back up to Supabase when available. Offline saves are labeled **Browser copy only** and provide **Back up online** for retrying. **Refresh saved list** retrieves cloud entries associated with this browser's private archive key. Clearing browser data loses that key; download important sessions beforehand. There is no account-based recovery or cross-device archive list. QR credentials are excluded from snapshots. Cloud archives are separate from expiring QR sessions and are not removed when QR sessions expire. Up to 100 snapshots per browser key can be backed up online.

For a new deployment, run `supabase/session-archives.sql` after the check-in migration.

## Player page and lineup requests

Session QR codes now open `player.html`, a read-only live view of current courts, waiting players, and game counts. Existing `join.html` QR links redirect there. Players can join with a nickname or select an existing nickname to track their position. The page shows **games ahead** (queued games scheduled before theirs, excluding games already on court), **up next**, or **playing on Court N**. Estimates account for custom groups and may change as courts finish, arrivals join, or organizers change the queue. Updates are polled every five seconds, with a delayed-update warning when the organizer has not synced in 20 seconds.

Players who check in through the player page receive a private device key that lets them request a lineup consisting of themselves plus three waiting players. The organizer can approve (queues the group last) or decline. Only one pending request per player is allowed, and an existing organizer custom group must finish or be canceled before another can be approved. No queue change occurs merely by submitting a request. Approvals are checked against the current waiting list. The player can see the request decision. Manual roster entries and older check-ins can view their turn but do not have the new request credential; the organizer can still make their custom lineup manually.

The organizer must keep the session page open and visible to publish status. Anyone with the session link can view nicknames, game counts, queue positions, and court assignments. Organizer credentials and guest request credentials are never included in the public view. Player controls cannot start or end games, remove players, or approve requests. Closed/expired QR sessions show the last shared state and reject new check-ins or requests.

For a separate deployment, also run `supabase/player-page.sql` after the check-in migration, then `supabase/nickname-hardening.sql`. The hardening file rejects nicknames with no visible characters (for example a lone no-break space). It is safe to re-run and must also be applied once to an existing project.

Each player has **two approved custom lineups per session**. An approved lineup consumes one allowance for every selected player, whether requested by a player or set by the organizer. Declined requests do not consume allowances. Canceling grouping, skipping, or undoing an approval does not refund allowances. Resetting the live session starts fresh counts. The organizer roster shows usage and the player view shows remaining allowances. Shared-session limits are checked atomically by Supabase, including overlapping requests and retries.
