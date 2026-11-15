# Sideout

A pickleball doubles queue with browser storage and support for multiple courts.

The main address opens the landing page (`index.html`): a live court demo that builds itself and rotates players, how it works, what players see, club colors and sponsor banners on a gym-TV mockup, and what's coming. **Start a session** opens the organizer app at `app.html`. Returning organizers see **Continue your session** with their saved player and court counts, and anyone with QR check-in running is sent straight back to the app (add `?home` to the address to see the landing page anyway). The landing page has no tracking.

Each court is drawn to real proportions, with players' names in their service boxes. The first open court shows the next four in place. When a game rotates, names move between the courts and the queue so you can see where everyone went. When the page loads, each court is built on screen: the court is painted, the lines are drawn, the net goes up, and the players walk on. A new court is built the same way when you add it. Removing a court packs it up (the net comes down and the paint wipes away), then the remaining courts slide into place. Buttons work during the intro, and tapping one skips straight to the finished courts. Motion uses GSAP (bundled in `vendor/gsap`) and is turned off when the device asks for reduced motion.

Visit https://melvinmmelo.github.io/pickleballque/ for the landing page and select **Start a session**, or open `app.html` (the organizer app) directly.

A new session opens on **Start your session**, three steps that stay until the first game starts:

1. **Get players in.** Add unique nicknames by name, or use **Show a QR code to scan** so players add themselves.
2. **Set your courts.** Use **Add court** for additional courts. All courts share one arrival-order queue.
3. **Start the first game.** The button unlocks at four players and starts Court 1.

After that the page is laid out for running the session:

- **Top bar:** games played, players, **Undo**, and **More** (Customize, Feedback, usage stats, Reset session).
- **Needs attention:** lineup requests and notes about players who left or rejoined from their phone appear above the courts, with the buttons to handle them.
- **Courts** on the left and **Up next** on the right. Up next stays in view while the page scrolls. On a phone it is pinned to the bottom of the screen with the next four names, and **Show queue** opens the rest.
- **Tabs** below: **Players** (add by name, QR check-in, the player list), **Results**, and **Saved sessions**.

On each court:

- **Start game** assigns the first four waiting players to that court.
- **Finish game & rotate** counts one game for each player on that court, returns them to the queue, and starts the next four. Other courts remain unchanged.
- **Finish game only** counts the game and returns players without starting another game. Empty extra courts can be removed.

**Up next** shows the next four waiting players for whichever court becomes available, followed by the game after. With a single court, it also previews returning players if needed. **Skip** moves an upcoming player to the back without changing game counts; at least five available players are needed. New arrivals join at the back with zero actual games played.

Use **Remove** beside a waiting player to remove them from the list and queue after confirmation. For an on-court player, first use **Finish game only**. Removal can be undone. **Undo** reverses one change until reload. **Reset session** clears the players, counts, and courts, leaving one empty court.

Data saves in localStorage in the current browser. Existing single-court sessions migrate to Court 01 with game counts and queue order preserved. Data does not sync across devices, browsers, or between the local file and hosted site. Clearing browser storage may erase the session. A warning appears when saving is unavailable.

## Mix players

In plain first-come order, the four who finish a game go to the back of the line together and come back together. With a player count that is a multiple of four, the same four play each other all session, with the same partners.

Turn on **Mix players** on the Up next board to change that. The choice is remembered on that device and is off by default.

- When players come back from a court, two of them may trade places with two of the four waiting just ahead, when that repeats fewer past matchups than first-come order.
- Inside each foursome, teams are chosen for the fewest repeat partners, then the fewest repeat opponents.
- It stays fair: games played stay within one of each other, a waiting player is moved back at most once before they play, and nobody passes a player who has played fewer games. A turn can come one game sooner or later than first-come order. With few players and one court, that can mean two players play twice in a row while two others wait one extra game.
- The first round is always arrival order, since nobody has played yet.
- A pending custom lineup or a skip keeps plain order for that return, and a custom group is never split or re-paired.
- With one court, the board does not preview where the players on court will return, because that is decided when their game ends.

Past matchups come from the results log, so mixing looks at games finished in the current session. In a simulated 12-player session on one court, first-come order produced 3 different foursomes in 25 games; mixing produced 25, with 7 to 8 different partners per player.

## Switching players and recording results

While a game is in progress, tap a player on the court and then tap another player to switch them. This works within a court (to change teams or sides) and across courts. Tap the same player again, or press Escape, to cancel. If the switch changes who is on which team, players' guesses for that game start over. **Undo** reverses a switch.

Each court in play has **Add score**, which opens an optional winner and score entry with one line per team (**Clear score** removes what was entered). Enter both scores and the higher score is marked as the winner, or tap a team to record only who won. A half-entered or tied score stops **Finish game** with a message, so a wrong result is never saved. A score being typed is kept if the page reloads.

Every finished game is listed in the **Results** tab, newest first, with its teams, score and winner. Use **Add result** or **Edit** to record or fix a result later; clearing the score and winner saves the game with no result. The player list shows wins and losses under each player's game count once a winner is recorded. Saved sessions keep the results and each player's wins and losses. Results stay on the organizer's device and are not shown on the player page. The list keeps the latest 300 games.

## Announcements

Both pages show a dismissible announcement bar at the top (currently: tournament mode is coming soon). **Share your ideas** opens the Feedback form with the topic filled in, and **Dismiss** hides the bar in that browser. To post a different announcement, edit the text in `announcement.js` and change its `ID` so people who dismissed the old one see the new one; remember to bump the `?v=` on its script tags.

## Feedback, bug reports, and ratings

Both pages have a **Feedback** button (under **More** on the organizer page). Choose **Feedback** to give a 1–5 star rating and/or a message, or **Report a bug** to describe what went wrong (at least 10 characters). An email or phone for a reply is optional. To help fix problems, each submission includes the page, app version, browser, and screen size, plus on the organizer page the number of courts, players, and waiting players and whether QR check-in was on. Player names are never sent. A hidden field catches simple spam bots, and the server limits how many reports arrive per hour.

Submissions appear on the developer dashboard (`analytics.html`) with the average rating, a star breakdown, filters for open items, bugs, and feedback, and **Mark done** / **Reopen**. For a separate deployment, run `supabase/feedback.sql` after `analytics.sql`.

## Anonymous usage stats and the developer dashboard

The organizer and player pages send anonymous usage stats to Supabase: page visits, how long the page was on screen, and app actions such as games finished, QR sessions started, players added, check-ins, guesses, customizations by type, and sponsor banners added or removed. A random ID saved in each browser counts unique users. No names, nicknames, session contents, or IP addresses are sent. Anyone can turn stats off with **Turn off anonymous usage stats** (under **More** on the organizer page, at the bottom of the player page), which also deletes the random ID from that browser. Browsers that send Do Not Track or Global Privacy Control are never counted, search-engine crawlers and automated browsers are skipped, and nothing is sent from local files or localhost previews. Events older than 400 days are deleted.

`analytics.html` is the developer dashboard: users, visits, average and total time in use, daily charts, customizations by type, app actions, and what is live right now. It is not linked from the app and asks for the developer key before showing anything. The key lives only in `~/.config/sideout/analytics-key` on the developer's computer and in the browser where it was entered; the database stores only its SHA-256 hash. For a separate deployment, run `supabase/analytics.sql` after `sponsors.sql` and store the hash of your own key as described in `supabase/SETUP.md`.

## Sponsor banners

Open **More**, then **Customize**, and use **Sponsor banners** to add up to six banners, like ads during a broadcast. Each banner needs a sponsor name (also read aloud by screen readers) and can have an https link. Wide images work best, about 4 to 1 (for example 1200 × 300); they are resized in the browser and stored as small images. Banners take turns at the top of the page every 8 seconds with a crossfade. Dots show a specific banner, **Pause** stops the rotation, and hovering also holds it. While QR check-in is on, players see the same banners at the top of the player page, downloaded once and again only after a change. **Reset colors and logos** keeps the banners. For a separate deployment, run `supabase/sponsors.sql` after `match-guesses.sql`.

## Guess who wins

While QR check-in is on, each game in progress shows **Who wins?** on the player page with a button for each team. Players who checked in from their phone get one guess per game and can change it until the game ends. Players in that game can't guess on it. On the organizer page, each court in play shows the number of guesses as a split bar under the court, with Team A on the left and Team B on the right like the drawing. Each new game starts with no guesses, and guesses close when the game is finished. Guesses aren't scored, even when the organizer records the winner. If the organizer switches players between teams during a game, the guesses for that game start over. For a separate deployment, run `supabase/match-guesses.sql` after `branding.sql` and `player-leave.sql`.

## Leaving a session

Players who checked in by scanning the QR can tap **Leave session** on the player page when they are done for the day. The organizer page moves them to **Left** within about five seconds. Their game count stays on the record, they no longer appear in the queue, and saved sessions list them as Left. A player on court can leave once their game ends; if a leave arrives mid-game, they move to Left when that court is finished instead of returning to the queue. The organizer can use **Return** to put someone back at the end of the queue, or **Remove** to delete them. Only the phone that checked in can leave as that player; manual entries and older check-ins ask the organizer. For a separate deployment, run `supabase/player-leave.sql` after `player-page.sql`.

A player who left by mistake can tap **Rejoin the queue as** *their nickname* on the same phone. The organizer page moves them from **Left** to the end of the queue within about five seconds, and their game count stays. Like leaving, only the phone that checked in can rejoin as that player. Typing a departed player's nickname on another phone is refused with a pointer to their own phone or the organizer's **Return**, so nobody can take over a name shown as Left. For a separate deployment, run `supabase/player-rejoin.sql` after `match-guesses.sql`.

## Club colors and logos

Open **More**, then **Customize**, to choose a court color preset (Classic, Park green, Pro purple, Red clay, Night session) or set custom court, kitchen, surround, and button colors. A warning appears if a choice would make names or buttons hard to read. Upload a **club logo** for the top of the page and a **court logo** that appears on every court. Logos are resized in the browser and stored as small images. Branding is saved in this browser, separately from the session, so **Reset session** and **Undo** do not change it.

While QR check-in is on, players see the same colors and logos on the player page. Phones download the branding once, and again only after the organizer changes it. For a separate deployment, run `supabase/branding.sql` after `player-page.sql`; without it, the organizer page still shows the branding but players see the default look.

## Custom lineup at the back

Open **Custom lineup**, select four distinct waiting players (first two on Team A, last two on Team B), then choose **Queue lineup last**. Those four move to the back as a group; earlier waiting players go first. The chosen teams stay together until their turn. If fewer than four players remain ahead, they wait for returning players or new arrivals to complete their game. The custom group does not jump ahead. Later arrivals otherwise join behind the group.

**Cancel grouping** releases the grouping without changing current queue positions; Undo reverses the last action. Skipping clears the grouping, as does removing one of the selected players. The pending group survives reloads and other games starting, and clears when its own game starts.

## Optional session QR check-in

QR check-in is connected to Supabase on the hosted site. For a separate deployment, follow the [Supabase setup](supabase/SETUP.md). Use **Show a QR code to scan** on the hosted site (in step 1 of a new session, or in the **Players** tab later). While check-in is on, the QR code floats in the bottom right corner of the screen so it can be scanned from anywhere on the page. **Hide** tucks it into a small **Show QR** button, **Enlarge** makes it bigger for scanning from a distance, and the choice is remembered on that device. On a phone it starts tucked away so it never covers the court buttons. Arriving players scan the QR and enter a nickname with no login. Keep the organizer page open: new arrivals are appended automatically, usually within five seconds. Close check-in when finished; each QR also expires after 12 hours. Local manual entry remains available without Supabase or internet.

Development checks: run `npm ci && npm test` with Google Chrome installed. When you change a script or stylesheet, bump its `?v=` value in `app.html`, `player.html`, `join.html`, and `index.html` so browsers do not combine a new page with a stale cached script. Tests use a local PostgreSQL-compatible PGlite database and isolated browsers; no live Supabase account or production player data is used.

## Save session history

In the **Saved sessions** tab, use **Save session** to take a named snapshot of the current players, completed game counts, queue, courts, and custom lineup. Each click creates a separate snapshot. Saved sessions survive **Reset session**. Use **View** to review a snapshot, or **Download copy** to export it as JSON. Viewing does not replace the current queue.

Snapshots save locally first and then back up to Supabase when available. Offline saves are labeled **Browser copy only** and provide **Back up online** for retrying. **Refresh saved list** retrieves cloud entries associated with this browser's private archive key. Clearing browser data loses that key; download important sessions beforehand. There is no account-based recovery or cross-device archive list. QR credentials are excluded from snapshots. Cloud archives are separate from expiring QR sessions and are not removed when QR sessions expire. Up to 100 snapshots per browser key can be backed up online.

For a new deployment, run `supabase/session-archives.sql` after the check-in migration.

## Player page and lineup requests

Session QR codes now open `player.html`, a read-only live view of current courts, waiting players, and game counts. Existing `join.html` QR links redirect there. Players can join with a nickname or select an existing nickname to track their position. The page shows **games ahead** (queued games scheduled before theirs, excluding games already on court), **up next**, or **playing on Court N**. Estimates account for custom groups and may change as courts finish, arrivals join, or organizers change the queue. Updates are polled every five seconds, with a delayed-update warning when the organizer has not synced in 20 seconds.

Players who check in through the player page receive a private device key that lets them request a lineup consisting of themselves plus three waiting players. The organizer can approve (queues the group last) or decline. Only one pending request per player is allowed, and an existing organizer custom group must finish or be canceled before another can be approved. No queue change occurs merely by submitting a request. Approvals are checked against the current waiting list. The player can see the request decision. Manual roster entries and older check-ins can view their turn but do not have the new request credential; the organizer can still make their custom lineup manually.

The organizer must keep the session page open and visible to publish status. Anyone with the session link can view nicknames, game counts, queue positions, and court assignments. Organizer credentials and guest request credentials are never included in the public view. Player controls cannot start or end games, remove players, or approve requests. Closed/expired QR sessions show the last shared state and reject new check-ins or requests.

For a separate deployment, also run `supabase/player-page.sql` after the check-in migration, then `supabase/nickname-hardening.sql`. The hardening file rejects nicknames with no visible characters (for example a lone no-break space). It is safe to re-run and must also be applied once to an existing project.

Each player has **two approved custom lineups per session**. An approved lineup consumes one allowance for every selected player, whether requested by a player or set by the organizer. Declined requests do not consume allowances. Canceling grouping, skipping, or undoing an approval does not refund allowances. Resetting the live session starts fresh counts. The organizer roster shows usage and the player view shows remaining allowances. Shared-session limits are checked atomically by Supabase, including overlapping requests and retries.
