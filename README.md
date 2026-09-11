# Sideout

Open `index.html` in your browser. No installation, login, server, or internet connection is required.

1. Add unique player nicknames.
2. Select **Start game** once at least four players are waiting.
3. Select **Finish game & rotate** after each game. This counts one completed game for each player, sends the four players to the back, and starts the next four.

The queue follows arrival order. Late arrivals join at the back with zero actual games played; game totals never change queue priority. The next-game preview includes returning players (marked ↻) if fewer than four are waiting. Teams follow queue order; players may swap partners on court.

Remove waiting players with ×. On-court players can be removed after they rotate off court. **Undo last action** reverses one action, including a reset, until the page reloads.

Players, queue order, current game, and completed game counts save in browser localStorage. Use the same browser and file location to return to a session. Private browsing or clearing browser data may erase the session. Undo history is temporary. A storage warning appears if saving is unavailable.

Use **Skip** only in **Up next** to send that player to the back of the upcoming rotation without changing game counts. This also works for returning players, without affecting the current game. At least five players are required. Skips are saved and can be undone.
