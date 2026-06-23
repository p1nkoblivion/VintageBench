new ModelFormat('free', {
	icon: 'icon-format_free',
	category: 'general',
	// Modified for Vintage Bench on 2026-06-22: this single creation option now targets Vintage Story shape JSON.
	name: 'Vintage Story Model',
	description: 'Cuboid-based Vintage Story JSON shape model.',
	target: ['Vintage Story JSON'],
	format_page: {
		content: [
			{type: 'h3', text: tl('mode.start.format.informations')},
			{text: 'Create or open Vintage Story shape JSON for cuboid models. Use the Vintage Story asset tools for item/block context, variants and ByType maps, textures, display transforms, interaction boxes, attachments, alternates, advanced JSON, validation, backups, and mod workspace packaging.'}
		]
	},
	rotate_cubes: true,
	bone_rig: true,
	// Modified for Vintage Bench on 2026-06-22: Vintage Story shape coordinates use a 0..16 corner-origin grid.
	centered_grid: false,
	optional_box_uv: true,
	per_texture_uv_size: true,
	per_texture_wrap_mode: true,
	uv_rotation: true,
	display_mode: true,
	animation_mode: true,
	per_animator_rotation_interpolation: true,
	animated_textures: true,
	locators: true,
	new() {
		// Modified for Vintage Bench on 2026-06-22: create directly into the editor instead of reopening the setup/settings flow.
		return newProject(this);
	},
	onSetup(project, new_model) {
		(window as any).VintageStoryJson?.setupNewVintageStoryProject(project, new_model);
	},
})
