import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { flushEffects, nextTask } from '../_helpers.js';
import { DeferredArms, type DeferredArmsProps } from '../_fixtures/deferred-suspense-arms.tsrx';

const server = loadServerFixture<typeof import('../_fixtures/deferred-suspense-arms.tsrx')>(
	'packages/octane/tests/_fixtures/deferred-suspense-arms.tsrx',
);
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
	vi.restoreAllMocks();
});

/** Hydrate the server HTML, inside a synchronous act() when `inAct` is set. */
function setup(client: Partial<DeferredArmsProps> = {}, inAct = false) {
	const log: string[] = [];
	const drafts: string[] = [];
	const props: DeferredArmsProps = {
		log: (entry) => log.push(entry),
		label: 'server',
		theme: 'light',
		bText: 'b text',
		onDraft: (event, value) => drafts.push(event + ':' + value),
	};
	const container = document.createElement('div');
	document.body.append(container);
	container.innerHTML = renderToString(server.DeferredArms, props).html;
	const arm = (name: string) => container.querySelector(`[data-arm="${name}"]`)!;
	// Server nodes, captured before hydration so tests can check they are adopted.
	const buttons = { a: arm('a').querySelector('button')!, b: arm('b').querySelector('button')! };
	const nested = arm('a1').querySelector('button')!;
	const recoverable: unknown[] = [];
	let root!: Root;
	const hydrate = () => {
		root = hydrateRoot(
			container,
			DeferredArms,
			{ ...props, ...client },
			{ onRecoverableError: (error) => recoverable.push(error) },
		);
	};
	if (inAct) void act(hydrate);
	else hydrate();
	cleanups.push(() => {
		root.unmount();
		container.remove();
	});
	return { log, drafts, container, root, recoverable, arm, buttons, nested };
}

describe('server-resolved Suspense arms hydrate after the shell', () => {
	it('commits the shell first, then one arm per task once the budget is spent', async () => {
		const { log, container, buttons, nested } = setup();
		// Every budget check finds the window spent, so each task hydrates one arm.
		let now = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
		flushEffects();
		expect(log).toEqual(['layout:shell', 'passive:shell']);
		await nextTask();
		expect(log.slice(2)).toEqual(['layout:a']);
		await nextTask();
		expect(log.slice(3)).toEqual(['passive:a', 'layout:b']);
		await nextTask();
		// The arm nested in `a` was reached by `a`'s own pass, so it comes last.
		expect(log.slice(5)).toEqual(['passive:b', 'layout:a1']);
		await act(() => {});
		expect(log.slice(7)).toEqual(['passive:a1']);
		expect(container.querySelector('[data-arm="a"] button')).toBe(buttons.a);
		expect(container.querySelector('[data-arm="b"] button')).toBe(buttons.b);
		expect(container.querySelector('[data-arm="a1"] button')).toBe(nested);
		await act(() => nested.click());
		expect(nested.textContent).toBe('a1:server:light:1');
	});

	it('hydrates the arm a click targets before dispatching it', async () => {
		const { log, buttons, nested } = setup();
		const layouts = () => log.filter((entry) => entry.startsWith('layout:'));
		buttons.b.click();
		// The shell's queued effects run first, as before any render.
		expect(log.slice(0, 2)).toEqual(['layout:shell', 'passive:shell']);
		expect(layouts()).toEqual(['layout:shell', 'layout:b']);
		// A nested arm hydrates once the arm around it has.
		nested.click();
		expect(layouts()).toEqual(['layout:shell', 'layout:b', 'layout:a', 'layout:a1']);
		await act(() => {});
		expect(buttons.b.textContent).toBe('b:fixed:light:1');
		expect(nested.textContent).toBe('a1:server:light:1');
		expect(buttons.a.textContent).toBe('a:server:light:0');
	});

	it('hydrates an arm for input of a type no handler delegates', () => {
		const { log, arm } = setup();
		arm('b')
			.querySelector('input')!
			.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		expect(log).toContain('layout:b');
		expect(log).not.toContain('layout:a');
	});

	it('keeps an IME session typed into an arm before its turn', async () => {
		const { drafts, arm } = setup();
		const input = arm('b').querySelector('input')!;
		input.value = 'user draft';
		input.focus();
		input.setSelectionRange(1, 4);
		input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		input.value = 'user draft あ';
		input.setSelectionRange(12, 12);
		input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
		input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
		await act(() => {});
		expect(arm('b').querySelector('input')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(input.value).toBe('user draft あ');
		expect([input.selectionStart, input.selectionEnd]).toEqual([12, 12]);
		expect(drafts).toEqual(['input:user draft あ', 'compositionend:user draft あ']);
	});

	it('leaves arms dehydrated through a parent render that brings them nothing new', async () => {
		const { log, container, buttons } = setup();
		flushEffects();
		(container.querySelector('#rerender') as HTMLButtonElement).click();
		flushEffects();
		expect(container.querySelector('#rerender')!.textContent).toBe('renders 1');
		expect(log).toEqual(['layout:shell', 'passive:shell']);
		await act(() => {});
		expect(log).toContain('layout:b');
		expect(container.querySelector('[data-arm="b"] button')).toBe(buttons.b);
	});

	it('hydrates an arm before a parent update renders over it', async () => {
		const { log, container, recoverable, buttons, nested } = setup();
		flushEffects();
		(container.querySelector('#relabel') as HTMLButtonElement).click();
		flushEffects();
		expect(buttons.a.textContent).toBe('a:client:light:0');
		expect(container.querySelector('[data-arm="a"] button')).toBe(buttons.a);
		expect(container.querySelector('[data-arm="a1"] button')).toBe(nested);
		expect(nested.textContent).toBe('a1:client:light:0');
		// The update did not reach `b`, which still waits for its turn.
		expect(log).not.toContain('layout:b');
		await act(() => {});
		expect(log).toContain('layout:b');
		expect(container.querySelector('[data-arm="b"] button')).toBe(buttons.b);
		expect(recoverable).toEqual([]);
	});

	it('renders the current context into an arm whose provider changed before its turn', async () => {
		const { container, recoverable } = setup();
		flushEffects();
		(container.querySelector('#retheme') as HTMLButtonElement).click();
		await act(() => {});
		// The server HTML predates the new value, so the difference is not reported.
		expect(container.querySelector('[data-arm="a"] button')!.textContent).toBe('a:server:dark:0');
		expect(container.querySelector('[data-arm="b"] button')!.textContent).toBe('b:fixed:dark:0');
		expect(container.querySelector('[data-arm="a1"] button')!.textContent).toBe('a1:server:dark:0');
		expect(recoverable).toEqual([]);
	});

	it('drops arms whose root unmounts before their turn', async () => {
		const error = vi.spyOn(console, 'error');
		const { log, root, container } = setup();
		root.unmount();
		await nextTask();
		await act(() => {});
		expect(log).toEqual([]);
		expect(container.innerHTML).toBe('');
		expect(error).not.toHaveBeenCalled();
	});

	it('reports a mismatch inside a deferred arm once', async () => {
		const { container, recoverable, buttons } = setup({ bText: 'client b text' });
		await act(() => {});
		expect(recoverable).toHaveLength(1);
		expect(container.querySelector('[data-arm="b"] p')!.textContent).toBe('client b text');
		expect(container.querySelector('[data-arm="a"] button')).toBe(buttons.a);
	});

	it('hydrates every pending arm inside a synchronous act()', () => {
		const { log } = setup({}, true);
		expect(log).toEqual([
			'layout:shell',
			'passive:shell',
			'layout:a',
			'layout:b',
			'layout:a1',
			'passive:a',
			'passive:b',
			'passive:a1',
		]);
	});
});
