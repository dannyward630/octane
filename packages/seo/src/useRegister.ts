/**
 * Register one component instance's descriptors with the enclosing registry.
 *
 * Render-time registration keeps SSR and hydration snapshots complete. Client
 * effects confirm each source after commit; the outlet reverts sources from a
 * caught render that never committed.
 *
 * The second effect removes the source on unmount. Document metadata does not
 * affect layout, so it does not need to block paint.
 */
import { useContext, useEffect, useRef } from 'octane';
import { SeoContext } from './context.js';
import type { SeoConfig, SeoDescriptor } from './descriptors.js';
import { commitSeoSource } from './registry.js';

export function useRegisterSeo(descriptors: readonly SeoDescriptor[], config?: SeoConfig): void {
	const registry = useContext(SeoContext);
	if (registry === null) {
		throw new Error(
			'[@octanejs/seo] <Title>/<Meta>/<Link>/<Script>/<JsonLd>/<Seo> must render inside a <Head>.',
		);
	}
	const idRef = useRef<number>(0);
	if (idRef.current === 0) idRef.current = registry.nextSourceId();
	registry.register(idRef.current, descriptors);
	if (config !== undefined) registry.configure(idRef.current, config);

	// Two effects, and they must stay separate.
	//
	// Publish re-registers the committed descriptors and notifies the outlet. The
	// dependency array is left to the compiler on purpose: `descriptors` is read
	// here, so inference keys the effect on it and re-runs exactly when the
	// metadata this component contributes may have changed. Both calls are
	// idempotent, re-registering an equal set is a no-op and `flush()` does
	// nothing unless something actually changed.
	useEffect(() => {
		registry.register(idRef.current, descriptors);
		if (config !== undefined) registry.configure(idRef.current, config);
		commitSeoSource(registry, idRef.current);
		registry.flush();
	});

	// Teardown is mount/unmount ONLY. It cannot ride the effect above: that one
	// re-runs, and a cleanup running before each re-run would make a component
	// delete its own registration merely by re-rendering, letting an outer
	// default win. This closure reads nothing that changes, so inference gives it
	// mount/unmount semantics on its own.
	useEffect(() => {
		return () => {
			registry.remove(idRef.current);
			registry.flush();
		};
	});
}
