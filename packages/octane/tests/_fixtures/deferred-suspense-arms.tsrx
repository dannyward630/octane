import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'octane';

export interface DeferredArmsProps {
	log: (entry: string) => void;
	label: string;
	theme: string;
	/** The text arm `b` renders; a client value unlike the server's is a mismatch. */
	bText: string;
	onDraft: (event: string, value: string) => void;
}

const Theme = createContext('light');

function Arm(props: {
	name: string;
	label: string;
	text?: string;
	log: (entry: string) => void;
	onDraft: (event: string, value: string) => void;
}) @{
	const theme = useContext(Theme);
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.log('layout:' + props.name);
	}, []);
	useEffect(() => {
		props.log('passive:' + props.name);
	}, []);
	<section data-arm={props.name}>
		<button onClick={() => setCount(count + 1)}>
			{`${props.name}:${props.label}:${theme}:${count}` as string}
		</button>
		<input
			defaultValue="server draft"
			onInput={(event) => props.onDraft('input', (event.target as HTMLInputElement).value)}
			onCompositionEnd={(event) =>
				props.onDraft('compositionend', (event.target as HTMLInputElement).value)
			}
		/>
		@if (props.text !== undefined) {
			<p>{props.text as string}</p>
		}
		@if (props.name === 'a') {
			@try {
				<Arm name="a1" label={props.label} log={props.log} onDraft={props.onDraft} />
			} @pending {
				<p>{'nested loading'}</p>
			}
		}
	</section>
}

export function DeferredArms(props: DeferredArmsProps) @{
	const [label, setLabel] = useState(props.label);
	const [theme, setTheme] = useState(props.theme);
	const [renders, setRenders] = useState(0);
	useLayoutEffect(() => {
		props.log('layout:shell');
	}, []);
	useEffect(() => {
		props.log('passive:shell');
	}, []);
	<Theme value={theme}>
		<main>
			<button id="relabel" onClick={() => setLabel('client')}>
				{'relabel'}
			</button>
			<button id="retheme" onClick={() => setTheme('dark')}>
				{'retheme'}
			</button>
			<button id="rerender" onClick={() => setRenders(renders + 1)}>
				{`renders ${renders}` as string}
			</button>
			@try {
				<Arm name="a" label={label} log={props.log} onDraft={props.onDraft} />
			} @pending {
				<p>{'a loading'}</p>
			}
			@try {
				<Arm name="b" label="fixed" text={props.bText} log={props.log} onDraft={props.onDraft} />
			} @pending {
				<p>{'b loading'}</p>
			}
		</main>
	</Theme>
}
