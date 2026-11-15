import "./styles.css";

import { WIDGET_NAME } from "../value/constants.js";
import { HotspotsField } from "./HotspotsField.js";

/**
 * The plugin's admin entry. EmDash imports it for plugins that declare `admin.entry` and looks a field widget
 * up by `widget: "image-hotspots:<name>"` in `fields`.
 */
export const fields = {
	[WIDGET_NAME]: HotspotsField,
};
