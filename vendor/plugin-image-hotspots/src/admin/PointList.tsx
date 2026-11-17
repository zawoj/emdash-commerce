import type { HotspotMode } from "../value/constants.js";
import { HOTSPOT_MODE, LIMITS, POINT_SIDE } from "../value/constants.js";
import type { TextPatch } from "../value/points.js";
import { REORDER, type ReorderDirection } from "../value/points.js";
import type { HotspotPoint } from "../value/schema.js";
import { CoordinateInput } from "./CoordinateInput.js";
import { copy } from "./copy.js";
import { ProductPicker } from "./ProductPicker.js";
import type { ProductDirectory } from "./use-products.js";

interface PointListProps {
	id: string;
	mode: HotspotMode;
	points: readonly HotspotPoint[];
	selectedId: string | null;
	directory: ProductDirectory;
	onSelect: (id: string) => void;
	onCoordinate: (id: string, axis: "x" | "y", value: number) => void;
	onPatch: (id: string, patch: TextPatch) => void;
	onReorder: (id: string, direction: ReorderDirection) => void;
	onRemove: (id: string) => void;
}

export const PointList = ({
	id,
	mode,
	points,
	selectedId,
	directory,
	onSelect,
	onCoordinate,
	onPatch,
	onReorder,
	onRemove,
}: PointListProps) => (
	<ol className="ihp-list" aria-label={copy.pointsHeading}>
		{points.map((point, index) => {
			const key = `${id}-${point.id}`;
			const name = copy.pointName(index + 1);
			return (
				<li key={point.id} className="ihp-item" data-selected={point.id === selectedId}>
					<div className="ihp-item__head" onClick={() => onSelect(point.id)}>
						<span className="ihp-item__number" aria-hidden="true">
							{index + 1}
						</span>
						<strong className="ihp-item__name">{name}</strong>
						<span className="ihp-item__actions">
							<button
								type="button"
								className="ihp-btn ihp-btn--icon"
								aria-label={`${copy.moveUp}: ${name}`}
								disabled={index === 0}
								onClick={() => onReorder(point.id, REORDER.up)}
							>
								<span aria-hidden="true">↑</span>
							</button>
							<button
								type="button"
								className="ihp-btn ihp-btn--icon"
								aria-label={`${copy.moveDown}: ${name}`}
								disabled={index === points.length - 1}
								onClick={() => onReorder(point.id, REORDER.down)}
							>
								<span aria-hidden="true">↓</span>
							</button>
							<button
								type="button"
								className="ihp-btn ihp-btn--icon ihp-btn--danger"
								aria-label={`${copy.remove}: ${name}`}
								onClick={() => onRemove(point.id)}
							>
								<span aria-hidden="true">×</span>
							</button>
						</span>
					</div>
					<div className="ihp-item__body">
						<div className="ihp-row">
							<CoordinateInput
								id={`${key}-x`}
								label={`${copy.x}`}
								value={point.x}
								onCommit={(value) => onCoordinate(point.id, "x", value)}
							/>
							<CoordinateInput
								id={`${key}-y`}
								label={`${copy.y}`}
								value={point.y}
								onCommit={(value) => onCoordinate(point.id, "y", value)}
							/>
						</div>
						{mode === HOTSPOT_MODE.products ? (
							<div className="ihp-field">
								<span className="ihp-field__label" id={`${key}-product-label`}>
									{copy.product}
								</span>
								<ProductPicker
									id={`${key}-product`}
									value={point.productSlug}
									directory={directory}
									onChange={(slug) => onPatch(point.id, { productSlug: slug })}
								/>
							</div>
						) : (
							<>
								<label className="ihp-field" htmlFor={`${key}-title`}>
									<span className="ihp-field__label">{copy.title}</span>
									<input
										id={`${key}-title`}
										className="ihp-input"
										type="text"
										maxLength={LIMITS.title}
										value={point.title ?? ""}
										onChange={(event) => onPatch(point.id, { title: event.target.value })}
									/>
								</label>
								<label className="ihp-field" htmlFor={`${key}-text`}>
									<span className="ihp-field__label">{copy.text}</span>
									<textarea
										id={`${key}-text`}
										className="ihp-input"
										rows={2}
										maxLength={LIMITS.text}
										value={point.text ?? ""}
										onChange={(event) => onPatch(point.id, { text: event.target.value })}
									/>
								</label>
								<label className="ihp-field" htmlFor={`${key}-side`}>
									<span className="ihp-field__label">{copy.side}</span>
									<select
										id={`${key}-side`}
										className="ihp-input"
										value={point.side ?? ""}
										onChange={(event) =>
											onPatch(point.id, {
												side: event.target.value === "" ? undefined : (event.target.value as HotspotPoint["side"]),
											})
										}
									>
										<option value="">{copy.sideAuto}</option>
										<option value={POINT_SIDE.start}>{copy.sideStart}</option>
										<option value={POINT_SIDE.end}>{copy.sideEnd}</option>
									</select>
								</label>
							</>
						)}
					</div>
				</li>
			);
		})}
	</ol>
);
