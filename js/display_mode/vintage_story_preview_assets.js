// Modified for Vintage Bench on 2026-06-22: resolve Vintage Story preview assets from a local game installation instead of bundling game assets.

import { fs, PathModule } from "../native_apis";
import { tl } from "../languages";

export const VS_PREVIEW_ASSETS = [
	{id: 'seraph', label: 'Seraph', path: 'assets/game/shapes/entity/humanoid/seraph.json'},
	{id: 'vs_armor_stand', label: 'Vintage Story armor stand', path: 'assets/survival/entities/nonliving/mannequin.json'},
	{id: 'mannequin', label: 'Mannequin', path: 'assets/survival/blocktypes/wood/mannequin.json'},
	{id: 'tongs', label: 'Tongs', path: 'assets/survival/shapes/entity/humanoid/villageraccessories/held/tongsl.json'},
	{id: 'tool_rack', label: 'Tool rack', path: 'assets/survival/blocktypes/wood/toolrack.json'},
	{id: 'vertical_rack', label: 'Vertical rack', path: 'assets/survival/blocktypes/wood/moldrack.json'},
	{id: 'display_case', label: 'Display case', path: 'assets/survival/blocktypes/wood/displaycase.json'},
	{id: 'shelf', label: 'Shelf', path: 'assets/survival/blocktypes/wood/shelf.json'},
	{id: 'scroll_rack', label: 'Scroll rack', path: 'assets/survival/blocktypes/wood/woodtyped/scrollrack.json'},
	{id: 'antler_mount', label: 'Antler mount', path: 'assets/survival/blocktypes/wood/woodtyped/antlermount.json'},
	{id: 'trap', label: 'Trap crate', path: 'assets/survival/blocktypes/wood/trapcrate.json'},
	{id: 'forge', label: 'Forge', path: 'assets/survival/blocktypes/stone/generic/forge.json'},
	{id: 'omok_tabletop', label: 'Omok tabletop', path: 'assets/survival/blocktypes/wood/table.json'},
	{id: 'firepit', label: 'Firepit', path: 'assets/survival/blocktypes/wood/firepit.json'}
];

let warned_missing_assets = false;

export function getVintageStoryAssetRoot() {
	return settings?.vintage_story_assets_path?.value || '';
}

export function resolveVintageStoryPreviewAsset(asset_id) {
	let asset = VS_PREVIEW_ASSETS.find(entry => entry.id === asset_id);
	let root = getVintageStoryAssetRoot();
	if (!asset || !root) return null;
	return PathModule.join(root, ...asset.path.split('/'));
}

export function getVintageStoryPreviewAssetStatus(asset_ids = VS_PREVIEW_ASSETS.map(asset => asset.id)) {
	return asset_ids.filter(id => VS_PREVIEW_ASSETS.some(entry => entry.id === id)).map(id => {
		let asset = VS_PREVIEW_ASSETS.find(entry => entry.id === id);
		let resolved = resolveVintageStoryPreviewAsset(id);
		return {
			id,
			label: asset?.label || id,
			path: resolved,
			exists: !!(resolved && fs.existsSync(resolved))
		};
	});
}

export function warnAboutMissingVintageStoryPreviewAssets(asset_ids) {
	if (warned_missing_assets || !Blockbench?.showQuickMessage) return;
	let root = getVintageStoryAssetRoot();
	if (!root) {
		warned_missing_assets = true;
		Blockbench.showQuickMessage(tl('message.vintage_story_assets.configure'), 3000);
		return;
	}
	let missing = getVintageStoryPreviewAssetStatus(asset_ids).filter(asset => !asset.exists);
	if (missing.length) {
		warned_missing_assets = true;
		Blockbench.showQuickMessage(`Missing Vintage Story preview asset: ${missing[0].label}`, 3000);
	}
}
