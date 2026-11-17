import { useRef, type KeyboardEvent, type PointerEvent, type MouseEvent } from "react";

import { aspectRatioOf, isArrowKey, positionAfterKey, positionFromPointer, type Position } from "../value/geometry.js";
import { imageUrlOf } from "../value/image.js";
import type { HotspotPoint, ImageValue } from "../value/schema.js";
import { copy } from "./copy.js";

interface ImageStageProps {
	id: string;
	image: ImageValue;
	points: readonly HotspotPoint[];
	selectedId: string | null;
	canAdd: boolean;
	/** Short text per point for the marker's accessible name. */
	summaryOf: (point: HotspotPoint) => string;
	onSelect: (id: string) => void;
	onAdd: (position: Position) => void;
	onMove: (id: string, position: Position) => void;
	onNudge: (id: string, position: Position) => void;
	onRemove: (id: string) => void;
}

const DRAG_BUTTON = 0;

/**
 * The image with its numbered points. Points sit at `left/top` percentages of the stage, so they stay on the
 * same spot of the picture at any width. A click on the image adds a point, a drag moves one, and a focused
 * point moves with the arrow keys (the keyboard route for everything the pointer can do).
 */
export const ImageStage = ({
	id,
	image,
	points,
	selectedId,
	canAdd,
	summaryOf,
	onSelect,
	onAdd,
	onMove,
	onNudge,
	onRemove,
}: ImageStageProps) => {
	const stageRef = useRef<HTMLDivElement>(null);
	const dragId = useRef<string | null>(null);
	const url = imageUrlOf(image);

	const positionOf = (event: { clientX: number; clientY: number }): Position | null => {
		const box = stageRef.current?.getBoundingClientRect();
		return box ? positionFromPointer(event, box) : null;
	};

	const handleStageClick = (event: MouseEvent<HTMLDivElement>) => {
		if (!canAdd) return;
		const position = positionOf(event);
		if (position) onAdd(position);
	};

	const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, pointId: string) => {
		if (event.button !== DRAG_BUTTON) return;
		event.currentTarget.focus();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		dragId.current = pointId;
		onSelect(pointId);
	};

	const handlePointerMove = (event: PointerEvent<HTMLButtonElement>, pointId: string) => {
		if (dragId.current !== pointId) return;
		const position = positionOf(event);
		if (position) onMove(pointId, position);
	};

	const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
		dragId.current = null;
		if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, point: HotspotPoint) => {
		if (isArrowKey(event.key)) {
			event.preventDefault();
			const next = positionAfterKey(point, event.key, event.shiftKey);
			if (next) onNudge(point.id, next);
			return;
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			onRemove(point.id);
		}
	};

	return (
		<div className="ihp-stage-wrap">
			<div
				ref={stageRef}
				className="ihp-stage"
				role="group"
				aria-label={copy.stageLabel}
				style={{ "--ihp-ratio": aspectRatioOf(image) } as React.CSSProperties}
				data-can-add={canAdd}
				onClick={handleStageClick}
			>
				{url ? <img className="ihp-stage__img" src={url} alt={image.alt ?? ""} draggable={false} /> : null}
				{points.map((point, index) => (
					<button
						key={point.id}
						type="button"
						className="ihp-marker"
						data-point-id={point.id}
						data-selected={point.id === selectedId}
						style={{ left: `${point.x}%`, top: `${point.y}%` }}
						aria-label={copy.pointMarkerLabel(index + 1, summaryOf(point), point.x, point.y)}
						aria-describedby={`${id}-help`}
						onClick={(event) => {
							event.stopPropagation();
							onSelect(point.id);
						}}
						onPointerDown={(event) => handlePointerDown(event, point.id)}
						onPointerMove={(event) => handlePointerMove(event, point.id)}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						onKeyDown={(event) => handleKeyDown(event, point)}
						onFocus={() => onSelect(point.id)}
					>
						{index + 1}
					</button>
				))}
			</div>
			<p className="ihp-help" id={`${id}-help`}>
				{copy.stageHelp}
			</p>
		</div>
	);
};
