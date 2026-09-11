# Sideout

A pickleball doubles queue with browser storage and support for multiple courts.

Open `index.html` directly, or visit https://melvinmmelo.github.io/pickleballque/.

1. Add unique player nicknames.
2. Use **Add court** for additional courts. All courts share one arrival-order queue.
3. **Start game** assigns the first four waiting players to that court.
4. **Finish game & rotate** counts one game for each player on that court, returns them to the queue, and starts the next four. Other courts remain unchanged.
5. **Finish & free court** counts the game and returns players without starting another game. Empty extra courts can be removed.

**Up next** shows the next four waiting players for whichever court becomes available. With a single court, it also previews returning players if needed. **Skip** moves an upcoming player to the back without changing game counts; at least five available players are needed. New arrivals join at the back with zero actual games played.

Waiting players can be removed with ×. **Undo last action** reverses one change until reload. **Reset session** clears the players, counts, and courts, leaving one empty court.

Data saves in localStorage in the current browser. Existing single-court sessions migrate to Court 01 with game counts and queue order preserved. Data does not sync across devices, browsers, or between the local file and hosted site. Clearing browser storage may erase the session. A warning appears when saving is unavailable.
