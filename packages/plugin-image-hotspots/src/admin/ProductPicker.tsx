import { useEffect, useMemo, useState } from "react";

import { copy } from "./copy.js";
import { LOAD_STATE, useDebounced, type ProductDirectory, type ProductOption } from "./use-products.js";

interface ProductPickerProps {
	id: string;
	/** The selected product slug, if any. */
	value: string | undefined;
	directory: ProductDirectory;
	onChange: (slug: string | undefined) => void;
}

const matches = (option: ProductOption, query: string): boolean => {
	const needle = query.trim().toLowerCase();
	if (needle === "") return true;
	return option.title.toLowerCase().includes(needle) || option.slug.toLowerCase().includes(needle);
};

/** Choose a product by name: a disclosure with a search box and a list of buttons (stores the slug). */
export const ProductPicker = ({ id, value, directory, onChange }: ProductPickerProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const debounced = useDebounced(query);
	const [remote, setRemote] = useState<ProductOption[] | null>(null);
	const panelId = `${id}-panel`;

	const isServerSearch = !directory.isComplete && debounced.trim() !== "";
	useEffect(() => {
		if (!isOpen || !isServerSearch) {
			setRemote(null);
			return;
		}
		let isCurrent = true;
		directory
			.search(debounced.trim())
			.then((options) => {
				if (isCurrent) setRemote(options);
			})
			.catch(() => {
				if (isCurrent) setRemote([]);
			});
		return () => {
			isCurrent = false;
		};
		// `directory.search` is stable; the debounced text drives the request.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, isServerSearch, debounced]);

	const visible = useMemo(
		() => (isServerSearch && remote ? remote : directory.items.filter((option) => matches(option, query))),
		[isServerSearch, remote, directory.items, query],
	);

	const title = value ? directory.titleOf(value) : undefined;
	const isUnknown = Boolean(value) && !title && directory.state === LOAD_STATE.ready && directory.isComplete;

	const select = (slug: string | undefined) => {
		onChange(slug);
		setIsOpen(false);
		setQuery("");
	};

	return (
		<div className="ihp-product">
			<div className="ihp-product__current" id={`${id}-current`}>
				{value ? (
					<>
						<span className="ihp-product__name">{title ?? value}</span>
						<code className="ihp-product__slug">{value}</code>
						{isUnknown ? <span className="ihp-badge ihp-badge--warn">{copy.productUnknown}</span> : null}
					</>
				) : (
					<span className="ihp-muted">{copy.productNone}</span>
				)}
			</div>
			<div className="ihp-row">
				<button
					type="button"
					className="ihp-btn"
					aria-expanded={isOpen}
					aria-controls={panelId}
					aria-describedby={`${id}-current`}
					onClick={() => setIsOpen((current) => !current)}
				>
					{value ? copy.changeProduct : copy.chooseProduct}
				</button>
				{value ? (
					<button type="button" className="ihp-btn ihp-btn--quiet" onClick={() => select(undefined)}>
						{copy.clearProduct}
					</button>
				) : null}
			</div>
			{isOpen ? (
				<div className="ihp-product__panel" id={panelId}>
					<input
						type="search"
						className="ihp-input"
						aria-label={copy.productSearch}
						placeholder={copy.productSearch}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.stopPropagation();
								setIsOpen(false);
							}
						}}
					/>
					{directory.state === LOAD_STATE.loading ? <p className="ihp-muted">{copy.productLoading}</p> : null}
					{directory.state === LOAD_STATE.error ? (
						<p role="alert" className="ihp-error">
							{copy.productError}{" "}
							<button type="button" className="ihp-link" onClick={directory.reload}>
								{copy.productRetry}
							</button>
						</p>
					) : null}
					{directory.state === LOAD_STATE.ready && visible.length === 0 ? (
						<p className="ihp-muted">{copy.productEmpty}</p>
					) : null}
					<ul className="ihp-product__list">
						{visible.map((option) => (
							<li key={option.slug}>
								<button
									type="button"
									className="ihp-product__option"
									aria-pressed={option.slug === value}
									onClick={() => select(option.slug)}
								>
									<span>{option.title}</span>
									<code className="ihp-product__slug">{option.slug}</code>
									{option.isDraft ? <span className="ihp-badge">{copy.productDraft}</span> : null}
								</button>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
};
