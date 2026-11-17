import { useEffect, useState } from "react";

import { COORDINATE } from "../value/constants.js";
import { roundCoordinate } from "../value/geometry.js";

interface CoordinateInputProps {
	id: string;
	label: string;
	value: number;
	onCommit: (value: number) => void;
}

/** A percentage input that lets you type freely and commits every valid number (clamped to 0..100). */
export const CoordinateInput = ({ id, label, value, onCommit }: CoordinateInputProps) => {
	const [draft, setDraft] = useState(String(value));
	const [isEditing, setIsEditing] = useState(false);

	useEffect(() => {
		if (!isEditing) setDraft(String(value));
	}, [value, isEditing]);

	return (
		<label className="ihp-field ihp-field--coordinate" htmlFor={id}>
			<span className="ihp-field__label">{label}</span>
			<input
				id={id}
				className="ihp-input"
				type="number"
				inputMode="decimal"
				min={COORDINATE.min}
				max={COORDINATE.max}
				step={0.01}
				value={draft}
				onFocus={() => setIsEditing(true)}
				onBlur={() => {
					setIsEditing(false);
					setDraft(String(value));
				}}
				onChange={(event) => {
					setDraft(event.target.value);
					if (event.target.value.trim() === "") return;
					const parsed = Number(event.target.value);
					if (Number.isFinite(parsed)) onCommit(roundCoordinate(parsed));
				}}
			/>
		</label>
	);
};
