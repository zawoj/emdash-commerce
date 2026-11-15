import { MediaPickerModal, type MediaItem } from "@emdash-cms/admin";
import { useEffect, useMemo, useRef, useState } from "react";

import { HOTSPOT_MODE } from "../value/constants.js";
import type { Position } from "../value/geometry.js";
import { normaliseValue } from "../value/normalise.js";
import {
	addPoint,
	canAddPoint,
	getPoint,
	movePointTo,
	patchPoint,
	removePoint,
	reorderPoint,
	resolveOptions,
	setImage,
	type ReorderDirection,
	type TextPatch,
} from "../value/points.js";
import type { HotspotPoint, HotspotsValue } from "../value/schema.js";
import { copy } from "./copy.js";
import { ImageStage } from "./ImageStage.js";
import { mediaItemToImageValue } from "./media.js";
import { PointList } from "./PointList.js";
import { useProductDirectory } from "./use-products.js";

/** What EmDash passes to a plugin field widget (`@emdash-cms/admin`, FieldRenderer). */
export interface FieldWidgetProps {
	value: unknown;
	onChange: (value: HotspotsValue) => void;
	label: string;
	id: string;
	required?: boolean;
	options?: Record<string, unknown>;
	validation?: unknown;
	minimal?: boolean;
}

const CENTRE: Position = { x: 50, y: 50 };
/** Each point added with the button lands a little off the last so they do not stack. */
const BUTTON_OFFSET = 4;

export const HotspotsField = ({ value, onChange, label, id, required, options }: FieldWidgetProps) => {
	const { mode, maxPoints } = useMemo(() => resolveOptions(options), [options]);
	const current = useMemo(() => normaliseValue(value, maxPoints, { shouldTrim: false }), [value, maxPoints]);
	// Pointer events arrive faster than React re-renders: compose each change on the latest value.
	const latest = useRef(current);
	latest.current = current;

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [focusId, setFocusId] = useState<string | null>(null);
	const [isPickerOpen, setIsPickerOpen] = useState(false);
	const [announcement, setAnnouncement] = useState("");
	const rootRef = useRef<HTMLDivElement>(null);
	const addRef = useRef<HTMLButtonElement>(null);
	const directory = useProductDirectory(mode === HOTSPOT_MODE.products);

	const commit = (next: HotspotsValue) => {
		if (next === latest.current) return;
		latest.current = next;
		onChange(next);
	};

	useEffect(() => {
		if (!focusId) return;
		const marker = rootRef.current?.querySelector<HTMLElement>(`[data-point-id="${CSS.escape(focusId)}"]`);
		if (!marker) return;
		marker.focus();
		setFocusId(null);
	}, [focusId, current]);

	const indexOf = (pointId: string): number => latest.current.points.findIndex((point) => point.id === pointId);
	const announceAt = (pointId: string) => {
		const point = getPoint(latest.current, pointId);
		if (point) setAnnouncement(copy.pointAt(indexOf(pointId) + 1, point.x, point.y));
	};

	const summaryOf = (point: HotspotPoint): string => {
		if (mode === HOTSPOT_MODE.products) return point.productSlug ? (directory.titleOf(point.productSlug) ?? point.productSlug) : "";
		return point.title ?? "";
	};

	const handleAdd = (position: Position) => {
		const before = latest.current;
		const next = addPoint(before, position, maxPoints);
		if (next === before) return;
		commit(next);
		const added = next.points[next.points.length - 1]!;
		setSelectedId(added.id);
		setFocusId(added.id);
		announceAt(added.id);
	};

	const handleAddWithButton = () => {
		const count = latest.current.points.length;
		const offset = (count % 5) * BUTTON_OFFSET;
		handleAdd({ x: CENTRE.x + offset, y: CENTRE.y + offset });
	};

	const handleMove = (pointId: string, position: Position) => commit(movePointTo(latest.current, pointId, position));
	const handleNudge = (pointId: string, position: Position) => {
		commit(movePointTo(latest.current, pointId, position));
		announceAt(pointId);
	};

	const handleCoordinate = (pointId: string, axis: "x" | "y", coordinate: number) => {
		const point = getPoint(latest.current, pointId);
		if (!point) return;
		commit(movePointTo(latest.current, pointId, { x: axis === "x" ? coordinate : point.x, y: axis === "y" ? coordinate : point.y }));
	};

	const handlePatch = (pointId: string, patch: TextPatch) => commit(patchPoint(latest.current, pointId, patch));

	const handleReorder = (pointId: string, direction: ReorderDirection) => {
		commit(reorderPoint(latest.current, pointId, direction));
		setFocusId(pointId);
	};

	const handleRemove = (pointId: string) => {
		const index = indexOf(pointId);
		const next = removePoint(latest.current, pointId);
		if (next === latest.current) return;
		commit(next);
		setAnnouncement(copy.removed(index + 1));
		const neighbour = next.points[Math.min(index, next.points.length - 1)];
		setSelectedId(neighbour?.id ?? null);
		if (neighbour) setFocusId(neighbour.id);
		else addRef.current?.focus();
	};

	const handleSelectMedia = (item: MediaItem) => {
		commit(setImage(latest.current, mediaItemToImageValue(item)));
		setIsPickerOpen(false);
	};

	const canAdd = canAddPoint(current, maxPoints);
	const hasImage = current.image !== null;
	const headingId = `${id}-label`;

	return (
		<div className="ihp" ref={rootRef} role="group" aria-labelledby={headingId} data-mode={mode}>
			<div className="ihp__head">
				<span className="ihp__label" id={headingId}>
					{label}
					{required ? <span aria-hidden="true"> *</span> : null}
				</span>
				<span className="ihp-muted">{copy.pointCount(current.points.length, maxPoints)}</span>
			</div>

			<div className="ihp-row ihp__toolbar">
				<button type="button" className="ihp-btn" onClick={() => setIsPickerOpen(true)}>
					{hasImage ? copy.replaceImage : copy.chooseImage}
				</button>
				{hasImage ? (
					<button type="button" className="ihp-btn ihp-btn--quiet" onClick={() => commit(setImage(latest.current, null))}>
						{copy.removeImage}
					</button>
				) : null}
				{hasImage ? (
					<button
						type="button"
						className="ihp-btn ihp-btn--primary"
						ref={addRef}
						disabled={!canAdd}
						aria-describedby={canAdd ? undefined : `${id}-max`}
						onClick={handleAddWithButton}
					>
						{copy.addPoint}
					</button>
				) : null}
				{!canAdd ? (
					<span className="ihp-muted" id={`${id}-max`}>
						{copy.maxReached}
					</span>
				) : null}
			</div>

			{current.image ? (
				<div className="ihp__body">
					<ImageStage
						id={id}
						image={current.image}
						points={current.points}
						selectedId={selectedId}
						canAdd={canAdd}
						summaryOf={summaryOf}
						onSelect={setSelectedId}
						onAdd={handleAdd}
						onMove={handleMove}
						onNudge={handleNudge}
						onRemove={handleRemove}
					/>
					<div className="ihp__side">
						{current.points.length === 0 ? (
							<p className="ihp-empty">{copy.emptyPoints}</p>
						) : (
							<PointList
								id={id}
								mode={mode}
								points={current.points}
								selectedId={selectedId}
								directory={directory}
								onSelect={setSelectedId}
								onCoordinate={handleCoordinate}
								onPatch={handlePatch}
								onReorder={handleReorder}
								onRemove={handleRemove}
							/>
						)}
					</div>
				</div>
			) : (
				<p className="ihp-empty">{copy.emptyImage}</p>
			)}

			<div className="ihp-sr" role="status" aria-live="polite">
				{announcement}
			</div>

			<MediaPickerModal
				open={isPickerOpen}
				onOpenChange={setIsPickerOpen}
				onSelect={handleSelectMedia}
				mimeTypeFilter="image/"
				title={copy.pickerTitle}
			/>
		</div>
	);
};
