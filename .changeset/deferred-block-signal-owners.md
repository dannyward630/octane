---
'octane': patch
---

When `octane/signals` is enabled, a component no longer creates its signal owner on every render. A Block or lite component now creates its owner the first time its render declares, resolves or binds a signal, and event handlers and children record the scope until then. Hydrating a tree where few components read signals is faster and allocates less; ownership, retries and seeds are unchanged.
