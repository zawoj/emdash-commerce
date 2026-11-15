#!/usr/bin/env node
/**
 * Demo content for the storefront: a sports-apparel catalog (PLN) with vocabulary, brands, categories, products
 * with variants and prices, a membership with a recurring price, and the Homepage entry (CTA, shop-the-look points,
 * spotlight callouts). Dependency-free (Node >= 24), idempotent: everything is matched by slug or name, so running it
 * again updates in place.
 *
 * Usage:  pnpm seed [-- --only apparel,accessory,membership,home]
 * Env:    EMDASH_URL  base URL of the running storefront (default http://localhost:4360)
 *
 * Needs the dev server running (dev login) on a database that already has the schema: see "Fresh clone" in README.md.
 * Photos are Unsplash images named by photo id (`<id>.jpg`); each one is downloaded on demand into the git-ignored
 * `.cache/unsplash/` folder and uploaded to the EmDash media library. Nothing is committed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "unsplash");
const ORIGIN = (process.env.EMDASH_URL ?? "http://localhost:4360").replace(/\/+$/, "");
const BASE = `${ORIGIN}/_emdash/api`;
const PLUGIN = "stripe-commerce";
const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&fm=jpg`;

// ---------------------------------------------------------------- http
let cookie = "";

const storeCookies = (res) => {
	const pairs = res.headers.getSetCookie().map((line) => line.split(";")[0]);
	if (pairs.length === 0) return;
	const jar = new Map(cookie.split("; ").filter(Boolean).map((pair) => pair.split(/=(.*)/s).slice(0, 2)));
	for (const pair of pairs) {
		const [name, value] = pair.split(/=(.*)/s);
		jar.set(name, value);
	}
	cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
};

const login = async () => {
	const dev = async (path) => {
		const res = await fetch(`${ORIGIN}${path}`, { headers: { cookie }, signal: AbortSignal.timeout(60_000) });
		storeCookies(res);
		return { ok: res.ok, text: await res.text() };
	};
	let result = await dev("/_emdash/api/auth/dev-bypass");
	if (!result.ok && result.text.includes("SETUP_REQUIRED")) {
		// A fresh database: apply seed/seed.json (collections, sample content) through the dev setup, then sign in.
		await dev("/_emdash/api/setup/dev-bypass?content=1");
		result = await dev("/_emdash/api/auth/dev-bypass");
	}
	if (!result.ok) throw new Error(`dev login failed: ${result.text.slice(0, 300)}`);
};

const call = async (method, path, { body, form, retry = true } = {}) => {
	const headers = { "X-EmDash-Request": "1", cookie };
	let payload;
	if (form) payload = form;
	else if (body !== undefined) {
		payload = JSON.stringify(body);
		headers["Content-Type"] = "application/json";
	}
	const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, signal: AbortSignal.timeout(180_000) });
	storeCookies(res);
	const text = await res.text();
	if (!res.ok) {
		if (retry && (res.status === 401 || res.status === 403) && text.includes("NOT_AUTHENTICATED")) {
			await login();
			return call(method, path, { body, form, retry: false });
		}
		throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 600)}`);
	}
	return text ? JSON.parse(text) : {};
};

const unwrap = (response) => response.data ?? response;

// ---------------------------------------------------------------- content helpers
const cache = new Map();

const listAll = async (collection, refresh = false) => {
	if (!refresh && cache.has(collection)) return cache.get(collection);
	const items = [];
	let cursor;
	do {
		const data = unwrap(await call("GET", `/content/${collection}?limit=100${cursor ? `&cursor=${cursor}` : ""}`));
		items.push(...data.items);
		cursor = data.nextCursor;
	} while (cursor);
	cache.set(collection, items);
	return items;
};

const find = async (collection, key, field) => {
	const items = await listAll(collection);
	return items.find((item) => (field === undefined ? item.slug === key : item.data[field] === key));
};

/** Create or update (by slug, or by data[matchField]); optionally publish. Returns the item. */
const ensure = async (collection, data, { refs, slug, matchField, publish = true } = {}) => {
	const existing = slug ? await find(collection, slug) : await find(collection, data[matchField], matchField);
	const body = { data };
	if (refs !== undefined) body.references = refs;
	let item;
	if (existing) {
		item = unwrap(await call("PUT", `/content/${collection}/${existing.id}`, { body })).item;
	} else {
		if (slug) body.slug = slug;
		item = unwrap(await call("POST", `/content/${collection}`, { body })).item;
		cache.delete(collection);
	}
	if (publish && (item.status !== "published" || item.draftRevisionId)) {
		await call("POST", `/content/${collection}/${item.id}/publish`, { body: {} });
	}
	return item;
};

const portable = (...paragraphs) =>
	paragraphs.map((text, i) => ({
		_type: "block",
		_key: `b${i}`,
		style: "normal",
		markDefs: [],
		children: [{ _type: "span", _key: `s${i}`, text, marks: [] }],
	}));

// ---------------------------------------------------------------- media
const media = new Map();

/** The photo as a Blob: from the cache, else downloaded from Unsplash (`<photo id>.jpg` is the file name). */
const photo = async (filename) => {
	const path = join(CACHE, filename);
	if (!existsSync(path)) {
		const id = filename.replace(/\.jpg$/, "");
		const res = await fetch(UNSPLASH(id), { signal: AbortSignal.timeout(120_000) });
		if (!res.ok) throw new Error(`Unsplash photo ${id}: ${res.status}`);
		mkdirSync(CACHE, { recursive: true });
		writeFileSync(path, Buffer.from(await res.arrayBuffer()));
	}
	return new Blob([readFileSync(path)], { type: "image/jpeg" });
};

const upload = async (filename, alt) => {
	if (media.has(filename)) return media.get(filename);
	let cursor;
	do {
		const data = unwrap(await call("GET", `/media?limit=100${cursor ? `&cursor=${cursor}` : ""}`));
		const hit = data.items.find((item) => item.filename === filename);
		if (hit) {
			media.set(filename, hit);
			return hit;
		}
		cursor = data.nextCursor;
	} while (cursor);
	const form = new FormData();
	form.set("alt", alt);
	form.set("file", await photo(filename), filename);
	const item = unwrap(await call("POST", "/media", { form })).item;
	media.set(filename, item);
	return item;
};

/** What the admin's media picker stores for a library item: a local-provider value without `src`. */
const imageValue = async (filename, alt) => {
	const item = await upload(filename, alt);
	return {
		provider: "local",
		id: item.id,
		filename: item.filename,
		mimeType: item.mimeType || "image/jpeg",
		alt,
		width: item.width,
		height: item.height,
	};
};

const gallery = async (files, alt) =>
	Promise.all(files.map(async (file, i) => ({ image: await imageValue(file, alt), alt: `${alt} (${i + 2})` })));

// ---------------------------------------------------------------- vocabulary
const SIZES = [["XS", "XS"], ["S", "S"], ["M", "M"], ["L", "L"], ["XL", "XL"]];
const COLOURS = [
	["Black", "BLK", "#111111"],
	["White", "WHT", "#f5f5f5"],
	["Volt", "VLT", "#dcff0d"],
	["Red", "RED", "#e5322d"],
	["Navy", "NVY", "#1d2a44"],
];

const seedVocabulary = async () => {
	const v = { attr: {}, type: {}, brand: {}, cat: {} };
	const attr = (name, code, extra) =>
		ensure("attributes", { name, storefront_label: name, code, ...extra }, { matchField: "name" });
	const size = await attr("Size", "size", { input_type: "select", presentation: "buttons", is_filterable: true });
	const colour = await attr("Colour", "colour", { input_type: "select", presentation: "swatch", is_filterable: true });
	const material = await attr("Material", "material", { input_type: "text" });
	const weight = await attr("Weight", "weight_g", { input_type: "number", unit: "g" });
	const waterproof = await attr("Waterproof", "waterproof", { input_type: "boolean" });
	v.attr = { size: size.id, colour: colour.id, material: material.id, weight: weight.id, waterproof: waterproof.id };

	const makeValues = async (attrItem, rows) => {
		const out = {};
		for (const [label, code, swatch] of rows) {
			const data = { label, code, ...(swatch ? { swatch } : {}) };
			const values = await listAll("attribute_values");
			const existing = values.find((it) => it.data.label === label && it.data.code === code);
			let item;
			if (existing) {
				item = unwrap(await call("PUT", `/content/attribute_values/${existing.id}`, { body: { data } })).item;
			} else {
				item = unwrap(await call("POST", "/content/attribute_values", { body: { data } })).item;
				cache.delete("attribute_values");
			}
			if (item.status !== "published") await call("POST", `/content/attribute_values/${item.id}/publish`, { body: {} });
			out[label] = item.id;
		}
		// ordered children on the parent side
		await ensure("attributes", { ...attrItem.data }, { refs: { values: Object.values(out) }, slug: attrItem.slug });
		return out;
	};
	v.sizeValues = await makeValues(size, SIZES);
	v.colourValues = await makeValues(colour, COLOURS);

	const ptype = async (name, code, axes, specs, required) =>
		(
			await ensure(
				"product_types",
				{ name, code },
				{ refs: { variant_axes: axes, allowed_values: [], spec_attributes: specs, required_specs: required }, matchField: "name" },
			)
		).id;
	const A = v.attr;
	v.type = {
		apparel: await ptype("Apparel", "apparel", [A.size, A.colour], [A.material, A.weight, A.waterproof], [A.material]),
		accessory: await ptype("Accessory", "accessory", [], [A.material], []),
		membership: await ptype("Membership", "membership", [], [], []),
	};

	const brands = [
		["stride-lab", "Stride Lab", "https://stridelab.example", "Lightweight running kit tested on real roads, from first 5K to marathon."],
		["ridgeline", "Ridgeline", "https://ridgeline.example", "Cycling and triathlon apparel cut for long hours in the saddle."],
		["atlas-athletic", "Atlas Athletic", "https://atlasathletic.example", "Training essentials built to move with you, in the gym and out."],
	];
	for (const [slug, name, website, intro] of brands) {
		const data = {
			name,
			website,
			intro,
			description: portable(intro, `${name} designs for athletes who care about fit, durability and honest materials.`),
		};
		v.brand[slug] = (await ensure("brands", data, { slug })).id;
	}

	const cats = [
		["running", "Running", null, "Tees, shorts and shells for every distance.", "1486218119243-13883505764c.jpg"],
		["cycling", "Cycling", null, "Jerseys and bibs for the road.", "1534787238916-9ba6764efd4f.jpg"],
		["jerseys", "Jerseys", "cycling", "Cycling jerseys, built for the saddle.", "1517649763962-0c623066013b.jpg"],
		["triathlon", "Triathlon", null, "One kit for swim, bike and run.", "1593419528756-3cdfa1615b86.jpg"],
		["training", "Training", null, "Gym and studio basics.", "1606902965551-dce093cda6e7.jpg"],
		["new-arrivals", "New arrivals", null, "The latest drops.", "1600878585887-c2b9530999a1.jpg"],
		["sale", "Sale", null, "Last sizes at a lower price.", "1594381898411-846e7d193883.jpg"],
	];
	for (const [slug, name, parent, intro, image] of cats) {
		const data = { name, intro, image: await imageValue(image, name), description: portable(intro) };
		v.cat[slug] = (await ensure("product_categories", data, { refs: { parent: parent ? [v.cat[parent]] : [] }, slug })).id;
	}
	return v;
};

// ---------------------------------------------------------------- products
const charSum = (text) => [...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
const stockFor = (slug, label, i) => 4 + ((charSum(slug + label) + i * 7) % 24);

const APPAREL = [
	{
		slug: "aero-run-tee", title: "Aero Run Tee", price: 12900, brand: "stride-lab", cats: ["running", "new-arrivals"],
		sizes: ["XS", "S", "M", "L", "XL"], colours: ["Black", "Volt", "White"], material: "Recycled polyester mesh", weight: 120, waterproof: false,
		image: "1486218119243-13883505764c.jpg", colourImages: { Volt: "1581889470536-467bdbe30cd0.jpg" }, extra: "1605714312496-01e90cb509cc.jpg",
		copy: ["A featherweight tee with laser-cut ventilation and flatlock seams that disappear after the first kilometre.", "Quick-dry fabric, reflective heat-transfer details and a relaxed athletic cut."],
		overrides: { "M/Volt": 13900, "L/Volt": 13900 },
	},
	{
		slug: "velocity-shell", title: "Velocity Shell Jacket", price: 39900, brand: "stride-lab", cats: ["running", "sale"],
		sizes: ["S", "M", "L", "XL"], colours: ["Black", "Red"], material: "Recycled nylon, taped seams", weight: 340, waterproof: true,
		image: "1590333748338-d629e4564ad9.jpg", colourImages: { Red: "1547483238-f400e65ccd56.jpg" }, extra: "1631024724206-6ccc65ab31bd.jpg",
		copy: ["Packable wind and rain shell that stuffs into its own pocket.", "Fully taped seams, a storm hood and a high-visibility back panel."],
		overrides: {},
	},
	{
		slug: "pace-shorts", title: "Pace 2-in-1 Shorts", price: 14900, brand: "stride-lab", cats: ["running", "sale", "triathlon"],
		sizes: ["S", "M", "L", "XL"], colours: ["Black", "Navy"], material: "Recycled polyester, elastane liner", weight: 150, waterproof: false,
		image: "1744060204728-f68e434a3edf.jpg", colourImages: { Navy: "1540254597053-3901b858d40f.jpg" }, extra: "1683383277379-644816d886e2.jpg",
		copy: ["Shorts with a built-in compression liner and a zip pocket for keys.", "Wide stretch waistband that stays put at race pace."],
		overrides: { "XL/Navy": 12900 },
	},
	{
		slug: "peloton-jersey", title: "Peloton Cycling Jersey", price: 21900, brand: "ridgeline", cats: ["cycling", "jerseys", "new-arrivals"],
		sizes: ["S", "M", "L", "XL"], colours: ["Navy", "Volt", "Red"], material: "Italian stretch jersey", weight: 165, waterproof: false,
		image: "1534787238916-9ba6764efd4f.jpg", colourImages: { Volt: "1517649763962-0c623066013b.jpg" }, extra: "1541625602330-2277a4c46182.jpg",
		copy: ["A race-fit jersey with a full-length zip, three rear pockets and silicone grippers.", "Breathable panels under the arms keep you cool on long climbs."],
		overrides: { "S/Red": 19900 }, skip: ["XL/Red"],
	},
	{
		slug: "sprint-bibs", title: "Sprint Bib Shorts", price: 27900, brand: "ridgeline", cats: ["cycling", "triathlon"],
		sizes: ["S", "M", "L", "XL"], colours: ["Black", "Navy"], material: "Compression lycra, 3D pad", weight: 210, waterproof: false,
		image: "1528629297340-d1d466945dc5.jpg", colourImages: { Navy: "1471506480208-91b3a4cc78be.jpg" }, extra: "1534787238916-9ba6764efd4f.jpg",
		copy: ["All-day bib shorts with a multi-density chamois and silicone leg grippers.", "Mesh straps with a flat-lock finish to avoid pressure points."],
		overrides: {},
	},
	{
		slug: "race-tri-suit", title: "Race Day Tri Suit", price: 32900, brand: "ridgeline", cats: ["triathlon", "cycling", "new-arrivals"],
		sizes: ["S", "M", "L"], colours: ["Black", "Red"], material: "Quick-dry stretch, mesh back", weight: 190, waterproof: false,
		image: "1579758682665-53a1a614eea6.jpg", colourImages: { Red: "1593419528756-3cdfa1615b86.jpg" }, extra: "1528629297340-d1d466945dc5.jpg",
		copy: ["One suit for swim, bike and run, with a low-profile pad and rear pockets.", "Drag-reducing fabric and a front zip for fast transitions."],
		overrides: {},
	},
	{
		slug: "studio-tank", title: "Studio Training Tank", price: 8900, brand: "atlas-athletic", cats: ["training", "sale"],
		sizes: ["XS", "S", "M", "L"], colours: ["White", "Black", "Volt"], material: "Organic cotton blend", weight: 130, waterproof: false,
		image: "1606902965551-dce093cda6e7.jpg", colourImages: { Black: "1600696491085-19dbbeb4f8c1.jpg" }, extra: "1606903037631-f09fd0bd74b4.jpg",
		copy: ["A soft, breathable tank with a dropped armhole for full range of motion.", "Pre-washed for a lived-in feel from day one."],
		overrides: { "L/Volt": 7900 },
	},
	{
		slug: "flex-leggings", title: "Flex Training Leggings", price: 17900, brand: "atlas-athletic", cats: ["training", "new-arrivals"],
		sizes: ["XS", "S", "M", "L"], colours: ["Black", "Navy"], material: "Four-way stretch nylon", weight: 220, waterproof: false,
		image: "1584863495140-a320b13a11a8.jpg", colourImages: { Navy: "1594381898411-846e7d193883.jpg" }, extra: "1616118132534-381148898bb4.jpg",
		copy: ["High-rise leggings with a squat-proof, no-slip waistband and a hidden pocket.", "Seamless gusset and a four-way stretch that keeps its shape."],
		overrides: {},
	},
	{
		slug: "heavy-hoodie", title: "Heavy Cotton Hoodie", price: 26900, brand: "atlas-athletic", cats: ["training", "new-arrivals", "sale"],
		sizes: ["S", "M", "L", "XL"], colours: ["Black", "Navy", "White"], material: "Organic brushed cotton", weight: 620, waterproof: false,
		image: "1600878585887-c2b9530999a1.jpg", colourImages: { White: "1593419528756-3cdfa1615b86.jpg" }, extra: "1521369909029-2afed882baee.jpg",
		copy: ["A heavyweight hoodie for the walk to the gym and the walk home.", "Double-lined hood, kangaroo pocket and ribbed cuffs."],
		overrides: { "XL/White": 28900 },
	},
];

const ACCESSORIES = [
	{
		slug: "hydro-bottle", title: "Hydro Bottle 750 ml", price: 4900, sku: "BTL-750", stock: 80, brand: "atlas-athletic", cats: ["training", "new-arrivals"],
		material: "BPA-free Tritan", weight: 140, image: "1602143407151-7111542de6e8.jpg",
		gallery: ["1606903037631-f09fd0bd74b4.jpg", "1616118132534-381148898bb4.jpg"],
		copy: ["A leak-proof 750 ml bottle with a one-hand bite valve.", "Fits standard bike cages and car cup holders."],
	},
	{
		slug: "run-socks-3pack", title: "Run Socks 3-pack", price: 5900, sku: "SOCK-RUN3", stock: 120, brand: "stride-lab", cats: ["running", "sale"],
		material: "Merino blend", weight: 90, image: "1597843797221-e34b4a320b97.jpg",
		gallery: ["1486218119243-13883505764c.jpg", "1605714312496-01e90cb509cc.jpg", "1683383277379-644816d886e2.jpg"],
		copy: ["Cushioned, seamless socks with arch support and a cool-touch heel.", "Three pairs in neutral colours."],
	},
	{
		slug: "run-cap", title: "Run Cap", price: 6900, sku: "CAP-RUN", stock: 45, brand: "stride-lab", cats: ["running", "new-arrivals"],
		material: "Recycled polyester", weight: 55, image: "1588850561407-ed78c282e89b.jpg",
		gallery: ["1631024724206-6ccc65ab31bd.jpg", "1744060204728-f68e434a3edf.jpg"],
		copy: ["An ultralight cap with a laser-perforated crown and a sweatband.", "Adjustable strap with a reflective tab."],
	},
	{
		slug: "race-belt", title: "Race Number Belt", price: 7900, sku: "BELT-RACE", stock: 60, brand: "ridgeline", cats: ["triathlon", "cycling"],
		material: "Elastic nylon", weight: 35, image: "1595909315417-2edd382a56dc.jpg",
		gallery: ["1579758682665-53a1a614eea6.jpg", "1593419528756-3cdfa1615b86.jpg", "1528629297340-d1d466945dc5.jpg"],
		copy: ["A race belt with four gel loops and toggles for your bib number.", "Stays flat and bounce-free from the swim exit to the finish."],
	},
];

const specsForm = (v, material, weight, waterproof) => ({
	[`spec_${v.attr.material}`]: material,
	...(weight === undefined ? {} : { [`spec_${v.attr.weight}`]: weight }),
	...(waterproof === undefined ? {} : { [`spec_${v.attr.waterproof}`]: waterproof }),
});

const panel = async (productId, kind, body) =>
	unwrap(await call("POST", `/content/products/${productId}/plugin-extensions/${PLUGIN}/panel/${kind}`, { body }));

/** [size, colour, variant id] of a product, from its variants relation (titles look like "Product — M / Black"). */
const listVariants = async (productId) => {
	const data = unwrap(await call("GET", `/content/products/${productId}/references/catalog_product_variants/children?limit=100`));
	const order = new Map(SIZES.map(([label], n) => [label, n]));
	return data.children
		.map((child) => {
			const label = child.title.split(" — ").pop();
			const [size, colour] = label.split("/").map((part) => part.trim());
			return [size, colour, child.id];
		})
		.sort((a, b) => a[1].localeCompare(b[1]) || (order.get(a[0]) ?? 9) - (order.get(b[0]) ?? 9));
};

const seedApparel = async (v) => {
	for (const p of APPAREL) {
		const data = {
			title: p.title,
			description: portable(...p.copy),
			price: p.price,
			has_variants: true,
			track_inventory: true,
			allow_backorder: false,
			image: await imageValue(p.image, p.title),
			gallery: await gallery([p.extra], p.title),
		};
		const refs = { product_type: [v.type.apparel], brand: [v.brand[p.brand]], categories: p.cats.map((c) => v.cat[c]) };
		const product = await ensure("products", data, { refs, slug: p.slug, publish: false });
		await panel(product.id, "specification", {
			type: "form_submit",
			action_id: "save_specification",
			block_id: "specification",
			values: specsForm(v, p.material, p.weight, p.waterproof),
		});
		await panel(product.id, "variants", {
			type: "form_submit",
			action_id: "generate_variants",
			block_id: "variants_generate",
			values: {
				[`axis_${v.attr.size}`]: p.sizes.map((s) => v.sizeValues[s]),
				[`axis_${v.attr.colour}`]: p.colours.map((c) => v.colourValues[c]),
			},
		});
		const skip = new Set(p.skip ?? []);
		const variants = await listVariants(product.id);
		let kept = 0;
		for (const [i, [size, colour, id]] of variants.entries()) {
			const key = `${size}/${colour}`;
			if (skip.has(key)) {
				await call("DELETE", `/content/product_variants/${id}`); // a subset of the grid: drop the combination
				continue;
			}
			kept += 1;
			const vdata = { stock: stockFor(p.slug, size + colour, i) };
			if (p.overrides[key] !== undefined) vdata.price = p.overrides[key];
			if (p.colourImages[colour]) {
				vdata.image = await imageValue(p.colourImages[colour], `${p.title} ${colour}`);
				vdata.gallery = await gallery([p.extra], `${p.title} ${colour}`);
			}
			await call("PUT", `/content/product_variants/${id}`, { body: { data: vdata } });
		}
		await call("POST", `/content/products/${product.id}/publish`, { body: {} });
		console.log(`apparel ${p.slug}: ${kept} variants`);
	}
};

const inventoryOnHand = async (id) =>
	unwrap(await call("POST", `/plugins/${PLUGIN}/admin/inventory/get`, { body: { kind: "product", id } }))?.onHand ?? 0;

const seedAccessories = async (v) => {
	for (const p of ACCESSORIES) {
		const data = {
			title: p.title,
			description: portable(...p.copy),
			price: p.price,
			sku: p.sku,
			has_variants: false,
			track_inventory: true,
			allow_backorder: false,
			image: await imageValue(p.image, p.title),
			gallery: await gallery(p.gallery, p.title),
		};
		const refs = { product_type: [v.type.accessory], brand: [v.brand[p.brand]], categories: p.cats.map((c) => v.cat[c]) };
		const product = await ensure("products", data, { refs, slug: p.slug, publish: false });
		await panel(product.id, "specification", {
			type: "form_submit",
			action_id: "save_specification",
			block_id: "specification",
			values: specsForm(v, p.material, p.weight),
		});
		await call("POST", `/content/products/${product.id}/publish`, { body: {} });
		const have = await inventoryOnHand(product.id);
		if (have < p.stock) {
			await call("POST", `/plugins/${PLUGIN}/admin/inventory/adjust`, {
				body: { kind: "product", id: product.id, delta: p.stock - have, reason: "Initial stock (seed)" },
			});
		}
		console.log(`accessory ${p.slug}`);
	}
};

const seedMembership = async (v) => {
	const data = {
		title: "Club Membership",
		description: portable(
			"Join the club: member prices, early access to drops and monthly group sessions.",
			"Choose a one-off month pass or subscribe monthly with a 7-day free trial.",
		),
		price: 4900,
		sku: "CLUB-MEMBER",
		has_variants: false,
		track_inventory: false,
		allow_backorder: false,
		image: await imageValue("1552674605-db6ffd4facb5.jpg", "Club Membership"),
		gallery: await gallery(["1606903037631-f09fd0bd74b4.jpg", "1521369909029-2afed882baee.jpg", "1616118132534-381148898bb4.jpg"], "Club Membership"),
	};
	const refs = { product_type: [v.type.membership], brand: [v.brand["atlas-athletic"]], categories: [v.cat.training] };
	const product = await ensure("products", data, { refs, slug: "club-membership", publish: false });
	await ensure(
		"prices",
		{
			nickname: "Monthly membership",
			type: "recurring",
			unit_amount: 2900,
			currency: "pln",
			interval: "month",
			interval_count: 1,
			trial_days: 7,
			tax_behavior: "unspecified",
			lookup_key: "club-membership-monthly",
			is_active: true,
			is_default: false,
		},
		{ refs: { product: [product.id], variant: [] }, matchField: "nickname" },
	);
	await call("POST", `/content/products/${product.id}/publish`, { body: {} });
	console.log("membership club-membership");
};

// ---------------------------------------------------------------- homepage
/** The Homepage entry: CTA band (with the cyclists campaign photo), shop-the-look points, spotlight callouts. */
const seedHome = async () => {
	const home = await find("home", "home");
	if (!home) throw new Error('No "home" entry: the schema is missing, see "Fresh clone" in README.md');
	const point = (n, x, y, rest) => ({ id: `point-${n}`, x, y, ...rest });
	const data = {
		cta_eyebrow: "Members club",
		cta_heading: "Train with the club",
		cta_text: "Weekly group runs, member-only drops and 10% off every order. First 7 days free.",
		cta_button_label: "Join the club",
		cta_button_url: "/shop/club-membership",
		cta_image: await imageValue("1541625602330-2277a4c46182.jpg", "Two cyclists on a coastal road"),
		look_hotspots: {
			image: await imageValue("1552674605-db6ffd4facb5.jpg", "Runners on an open road"),
			points: [
				point(1, 46, 34, { productSlug: "aero-run-tee" }),
				point(2, 52, 60, { productSlug: "pace-shorts" }),
				point(3, 49, 14, { productSlug: "run-cap" }),
				point(4, 55, 90, { productSlug: "run-socks-3pack" }),
			],
		},
		spotlight_callouts: {
			image: await imageValue("1590333748338-d629e4564ad9.jpg", "Velocity Shell Jacket"),
			points: [
				point(1, 63, 14, { title: "Wind blocking", text: "Light membrane for cool mornings.", side: "end" }),
				point(2, 66, 44, { title: "Pockets", text: "Three rear pockets for gels and phone.", side: "end" }),
			],
		},
	};
	await call("PUT", `/content/home/${home.id}`, { body: { data } });
	await call("POST", `/content/home/${home.id}/publish`, { body: {} });
	console.log("home: CTA, shop-the-look points, spotlight callouts");
};

// ---------------------------------------------------------------- main
const main = async () => {
	const flag = process.argv.indexOf("--only");
	const only = flag === -1 ? null : process.argv[flag + 1].split(",");
	const wants = (name) => only === null || only.includes(name);
	await login();
	if (wants("apparel") || wants("accessory") || wants("membership")) {
		const v = await seedVocabulary();
		console.log("vocabulary ok");
		if (wants("apparel")) await seedApparel(v);
		if (wants("accessory")) await seedAccessories(v);
		if (wants("membership")) await seedMembership(v);
	}
	if (wants("home")) await seedHome();
	console.log("done");
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
