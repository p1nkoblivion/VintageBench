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
			{text: 'Cuboid editing base for Vintage Bench. Saves and opens Vintage Story shape JSON. TODO: add Vintage Story-specific display and validation tools.'}
		]
	},
	rotate_cubes: true,
	bone_rig: true,
	centered_grid: true,
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
