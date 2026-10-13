---
'@octanejs/tanstack-router': patch
---

Wait for a server-rendered match tree to hydrate before the router's mount work. Octane now hydrates Suspense boundaries after the shell, so the router's own Suspense boundary can still hold server HTML when its transitioner mounts. Canonicalizing the URL then started a navigation that hydrated the boundary from matches the server never rendered, replacing the server rows. The mount work now runs once the match tree first commits, whenever the location is already resolved.
