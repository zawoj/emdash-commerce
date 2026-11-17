import { useCallback, useEffect, useRef, useState } from "react";
import { fetchContentList } from "@emdash-cms/admin";

import { PRODUCT_COLLECTION } from "../value/constants.js";

export interface ProductOption {
	slug: string;
	title: string;
	isDraft: boolean;
}

export const LOAD_STATE = { loading: "loading", ready: "ready", error: "error" } as const;
export type LoadState = (typeof LOAD_STATE)[keyof typeof LOAD_STATE];

const DIRECTORY_LIMIT = 100;
const SEARCH_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 250;

interface ListedItem {
	slug: string | null;
	status: string;
	data: Record<string, unknown>;
}

export const toProductOption = (item: ListedItem): ProductOption | null => {
	if (!item.slug) return null;
	const title = typeof item.data.title === "string" && item.data.title.trim() !== "" ? item.data.title : item.slug;
	return { slug: item.slug, title, isDraft: item.status !== "published" };
};

export interface ProductDirectory {
	state: LoadState;
	items: readonly ProductOption[];
	/** True when every product is in `items`, so a slug that is missing really does not exist. */
	isComplete: boolean;
	titleOf: (slug: string) => string | undefined;
	reload: () => void;
	/** Server-side search for catalogues larger than the directory. */
	search: (query: string) => Promise<ProductOption[]>;
}

/** Loads the first page of products once; a larger catalogue is searched on the server. */
export const useProductDirectory = (isEnabled: boolean): ProductDirectory => {
	const [state, setState] = useState<LoadState>(LOAD_STATE.loading);
	const [items, setItems] = useState<ProductOption[]>([]);
	const [total, setTotal] = useState(0);
	const [attempt, setAttempt] = useState(0);
	const titles = useRef(new Map<string, string>());

	useEffect(() => {
		if (!isEnabled) return;
		let isCurrent = true;
		setState(LOAD_STATE.loading);
		fetchContentList(PRODUCT_COLLECTION, { limit: DIRECTORY_LIMIT, orderBy: "title", order: "asc" })
			.then((result) => {
				if (!isCurrent) return;
				const options = result.items.flatMap((item) => toProductOption(item) ?? []);
				for (const option of options) titles.current.set(option.slug, option.title);
				setItems(options);
				setTotal(result.total ?? options.length);
				setState(LOAD_STATE.ready);
			})
			.catch(() => {
				if (isCurrent) setState(LOAD_STATE.error);
			});
		return () => {
			isCurrent = false;
		};
	}, [isEnabled, attempt]);

	const search = useCallback(async (query: string): Promise<ProductOption[]> => {
		const result = await fetchContentList(PRODUCT_COLLECTION, { limit: SEARCH_LIMIT, search: query });
		const options = result.items.flatMap((item) => toProductOption(item) ?? []);
		for (const option of options) titles.current.set(option.slug, option.title);
		return options;
	}, []);

	return {
		state,
		items,
		isComplete: total <= items.length,
		titleOf: (slug) => titles.current.get(slug),
		reload: () => setAttempt((current) => current + 1),
		search,
	};
};

/** Debounces a value so a search box does not hit the server per keystroke. */
export const useDebounced = <T,>(value: T, delay: number = SEARCH_DEBOUNCE_MS): T => {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);
	return debounced;
};
