---
'octane': minor
---

Hydrate server-rendered Suspense boundaries after the shell, as React 19 does. `hydrateRoot` now adopts everything outside them in one task and commits it, and each boundary the server resolved hydrates in a later host task. Each task hydrates at least one boundary, and more while a ~5 ms budget lasts, so a large page no longer hydrates in one long task. Its shell's effects run before any boundary's.

A boundary hydrates before its turn when the user interacts with it: a click, key, focus, IME composition or input aimed at it hydrates it first, and its handlers then receive that event. New inputs from a parent render also hydrate it first, from the inputs its server HTML was rendered with, and the update then renders over the adopted DOM. `act()` hydrates every waiting boundary, so a test that checks a boundary's effects or handlers right after `hydrateRoot` needs `await act()`.
