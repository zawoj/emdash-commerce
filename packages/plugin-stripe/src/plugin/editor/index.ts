import type { PluginEditorAction, PluginEditorPanel } from "emdash";

import type { CommerceOptions } from "../../contracts/options.js";
import { catalogEditorActions, catalogEditorPanels } from "./catalog.js";
import { orderEditorPanels } from "./order-timeline.js";

export { catalogEditorActions, catalogEditorPanels } from "./catalog.js";

type Slugs = CommerceOptions["collections"];

/**
 * Every editor panel and action the plugin declares, composed from one array per area so a phase adds its own by
 * appending here (the order timeline panel joins the same way). Each declaration is scoped to its collection: without
 * `collections` EmDash would show the panel on every collection of the site.
 */
export const buildEditorPanels = (slugs: Slugs): PluginEditorPanel[] => [...catalogEditorPanels(slugs), ...orderEditorPanels(slugs)];
export const buildEditorActions = (slugs: Slugs): PluginEditorAction[] => [...catalogEditorActions(slugs)];
