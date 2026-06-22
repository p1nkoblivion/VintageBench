import DisplayModePanel from "./DisplayModePanel.vue";
import { THREE } from "../lib/libs";
import { Mode } from "../modes";
import { TransformerModule } from "../modeling/transform/transform_modules";
import DisplayReferences from "./display_references";
import VertShader from './../shaders/texture.vert.glsl';
import FragShader from './../shaders/texture.frag.glsl';
import { prepareShader } from "../shaders/shader";
import {
	VS_DISPLAY_CONTEXTS,
	createNeutralVintageStoryDisplaySlot,
	getVintageStoryDisplayContext
} from "./vintage_story_display_transforms";
import { warnAboutMissingVintageStoryPreviewAssets } from "./vintage_story_preview_assets";

var ground_timer = 0
var display_presets;
var display_preview;

let display_area = null;
let display_base = null;

export const DisplayMode = {
	display_slot: 'tpHandTransform',
	animate_preview: true,
};


export class DisplaySlot {
	constructor(id, data) {
		this.slot_id = id;
		this.default()
		if (data) this.extend(data)
	}
	default() {
		let neutral = createNeutralVintageStoryDisplaySlot(this.slot_id);
		this.rotation = neutral.rotation;
		this.translation = neutral.translation;
		this.origin = neutral.origin;
		this.scale = neutral.scale;
		this.vintage_story = neutral.vintage_story;
		this.rotation_pivot = [0, 0, 0];
		this.scale_pivot = [0, 0, 0];
		this.mirror = [false, false, false]
		this.fit_to_frame = false;
		return this;
	}
	copy() {
		return {
			rotation: this.rotation.slice(),
			translation: this.translation.slice(),
			origin: this.origin.slice(),
			scale: this.scale.slice(),
			rotation_pivot: this.rotation_pivot.slice(),
			scale_pivot: this.scale_pivot.slice(),
			mirror: this.mirror.slice(),
			fit_to_frame: this.fit_to_frame,
			vintage_story: JSON.parse(JSON.stringify(this.vintage_story || {}))
		}
	}
	export() {
		let build = {};
		let export_all = false;
		if (export_all || !this.rotation.allEqual(0)) build.rotation = this.rotation
		if (export_all || !this.translation.allEqual(0)) build.translation = this.translation
		if (export_all || !this.scale.allEqual(1) || !this.mirror.allEqual(false)) {
			build.scale = this.scale.slice()
			if (!this.mirror.allEqual(false)) {
				for (let i = 0; i < 3; i++) {
					build.scale[i] *= this.mirror[i] ? -1 : 1;
				}
			}
		}
		if (export_all || !this.rotation_pivot.allEqual(0)) build.rotation_pivot = this.rotation_pivot
		if (export_all || !this.scale_pivot.allEqual(0)) build.scale_pivot = this.scale_pivot
		if (Object.keys(build).length) {
			return build;
		}
	}
	exportBedrock() {
		let has_data = !this.rotation.allEqual(0)
			|| !this.translation.allEqual(0)
			|| !this.scale.allEqual(1)
			|| !this.mirror.allEqual(false)
			|| (this.fit_to_frame && this.slot_id == 'guiTransform');
		if (!has_data) return;

		let build = {
			rotation: this.rotation.slice(),
			translation: this.translation.slice(),
			scale: this.scale.slice(),
			rotation_pivot: this.rotation_pivot,
			scale_pivot: this.scale_pivot,
		}
		if (this.slot_id == 'guiTransform') {
			build.fit_to_frame = this.fit_to_frame;
		}
		if (!this.mirror.allEqual(false)) {
			for (let i = 0; i < 3; i++) {
				build.scale[i] *= this.mirror[i] ? -1 : 1;
			}
		}
		return build;
	}
	extend(data) {
		if (!data) return this;
		for (var i = 0; i < 3; i++) {
			if (data.rotation) Merge.number(this.rotation, data.rotation, i)
			if (data.mirror) Merge.boolean(this.mirror, data.mirror, i)
			if (data.scale) Merge.number(this.scale, data.scale, i)
			if (data.translation) Merge.number(this.translation, data.translation, i)
			if (data.origin) Merge.number(this.origin, data.origin, i)
			if (data.rotation_pivot) Merge.number(this.rotation_pivot, data.rotation_pivot, i)
			if (data.scale_pivot) Merge.number(this.scale_pivot, data.scale_pivot, i)
			this.scale[i] = Math.abs(this.scale[i]);
			this.rotation[i] = Math.trimDeg(this.rotation[i]);
			if (data.scale && data.scale[i] < 0) this.mirror[i] = true;
		}
		if (data.vintage_story) this.vintage_story = JSON.parse(JSON.stringify(data.vintage_story));
		if (typeof data.fit_to_frame == 'boolean') this.fit_to_frame = data.fit_to_frame;
		this.update()
		return this;
	}
	update() {
		if (Modes.display && this === DisplayMode.slot) {
			DisplayMode.vue.$forceUpdate()
			DisplayMode.updateDisplayBase()
		}
		return this;
	}
}

const VINTAGE_REFERENCE_BASES = {
	seraph: [6, 14, -2, -90, 0, 0, 1, 1, 1],
	vs_armor_stand: [0, 18, 0, 0, 0, 0, 1, 1, 1],
	mannequin: [0, 18, 0, 0, 0, 0, 1, 1, 1],
	firstperson: [0, 24, 20.8, 0, 0, 0, 1, 1, 1],
	ground: [8, 4, 8, 0, 0, 0, 1, 1, 1],
	ground_storage: [8, 4, 8, 0, 0, 0, 1, 1, 1],
	tongs: [0, 20, 18, -80, 0, 0, 1, 1, 1],
	tool_rack: [8, 8, 12, 0, 180, 0, 0.5, 0.5, 0.5],
	vertical_rack: [8, 8, 12, 0, 180, 0, 0.5, 0.5, 0.5],
	display_case: [8, 7, 8, 0, 0, 0, 0.6, 0.6, 0.6],
	shelf: [8, 7.75, 12, 0, 180, 0, 0.5, 0.5, 0.5],
	scroll_rack: [8, 8, 12, 0, 180, 0, 0.5, 0.5, 0.5],
	antler_mount: [8, 9, 12, 0, 180, 0, 0.5, 0.5, 0.5],
	inventory_nine: [0, 0, 0, 0, 0, 0, 0.4, 0.4, 0.4],
	inventory_full: [0, 0, 0, 0, 0, 0, 0.4, 0.4, 0.4],
	hud: [0, 0, 0, 0, 0, 0, 0.4, 0.4, 0.4],
	trap: [8, 5, 8, 0, 0, 0, 0.6, 0.6, 0.6],
	forge: [8, 5, 8, 0, 0, 0, 0.6, 0.6, 0.6],
	omok_tabletop: [8, 9, 8, 0, 0, 0, 0.5, 0.5, 0.5],
	firepit: [8, 5, 8, 0, 0, 0, 0.6, 0.6, 0.6],
	default: [8, 8, 8, 0, 0, 0, 1, 1, 1]
};



// Modified for Vintage Bench on 2026-06-22: replace Minecraft display presets with a single neutral Vintage Story transform preset.
display_presets = [{
	id: 'vintage_story_neutral',
	fixed: true,
	areas: Object.fromEntries(VS_DISPLAY_CONTEXTS
		.filter(context => !context.previewOnly)
		.map(context => [context.id, {
			rotation: [0, 0, 0],
			translation: [0, 0, 0],
			origin: [0, 0, 0],
			scale: [1, 1, 1]
		}]))
}];
if (localStorage.getItem('display_presets') != null) {
	var stored_display_presets = JSON.parse(localStorage.getItem('display_presets'))
	stored_display_presets.forEach(preset => {
		if (!preset?.areas) return;
		let filtered_areas = {};
		VS_DISPLAY_CONTEXTS.forEach(context => {
			if (preset.areas[context.id]) filtered_areas[context.id] = preset.areas[context.id];
		});
		if (Object.keys(filtered_areas).length) {
			display_presets.push({
				name: preset.name,
				areas: filtered_areas
			});
		}
	})
}



export class refModel {
	constructor(id, options = 0) {
		var scope = this;
		this.model = new THREE.Object3D();
		this.name = tl('display.reference.'+id);
		this.id = id;
		this.icon = options.icon || id;
		this.models = options.models || [];
		this.condition = options.condition;
		this.initialized = false;
		this.pose_angles = {};

		if (VINTAGE_REFERENCE_BASES[id]) {
			this.updateBasePosition = function() {
				// Modified for Vintage Bench on 2026-06-22: use neutral Vintage Story placeholder placement until local game shapes are converted for preview.
				let base = VINTAGE_REFERENCE_BASES[id] || VINTAGE_REFERENCE_BASES.default;
				setDisplayArea(...base);
			}
		}
		if (!this.updateBasePosition) {
			this.updateBasePosition = function() {
				// Modified for Vintage Bench on 2026-06-22: use neutral Vintage Story placeholder placement until local game shapes are converted for preview.
				let base = VINTAGE_REFERENCE_BASES[id] || VINTAGE_REFERENCE_BASES.default;
				setDisplayArea(...base);
			}
		}
	}
	buildModel(options) {
		let {elements, texture, texture_size} = options;
		if (!texture_size) texture_size = [16, 16];
		var scope = this;
		if (texture === 'black') {
			var mat = new THREE.MeshBasicMaterial({color: 0x101013});
		} else {
			var img = new Image();
			img.src = texture;
			var tex = new THREE.Texture(img);
			img.tex = tex;
			img.tex.magFilter = THREE.NearestFilter;
			img.tex.minFilter = THREE.NearestFilter;
			img.onload = function() {
				this.tex.needsUpdate = true;
			}
			img.crossOrigin = '';
			var mat = new THREE.ShaderMaterial({
				uniforms: {
					map: {type: 't', value: tex},
					SHADE: {type: 'bool', value: settings.shading.value},
					LIGHTCOLOR: {type: 'vec3', value: new THREE.Color().copy(Canvas.global_light_color).multiplyScalar(settings.brightness.value / 50)},
					LIGHTSIDE: {type: 'int', value: Canvas.global_light_side},
					EMISSIVE: {type: 'bool', value: false}
				},
				vertexShader: prepareShader(VertShader),
				fragmentShader: prepareShader(FragShader),
				side: THREE.DoubleSide,
				transparent: true
			});
			mat.map = tex;
		}

		scope.material = mat

		elements.forEach(function(s) {
			var mesh = new THREE.Mesh(new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]), mat)
			if (s.origin) {
				mesh.position.set(s.origin[0], s.origin[1], s.origin[2])
				mesh.geometry.translate(-s.origin[0], -s.origin[1], -s.origin[2])
			}
			mesh.geometry.translate(s.pos[0], s.pos[1], s.pos[2])
			if (s.rotation) {
				mesh.rotation.setFromDegreeArray(s.rotation)
			}
			if (s.model) {
				mesh.r_model = s.model
			}
			mesh.name = s.name || '';

			function getUVArray(face) {
				var arr = [
					[face.uv[0]/texture_size[0], 1-(face.uv[1]/texture_size[1])],
					[face.uv[2]/texture_size[0], 1-(face.uv[1]/texture_size[1])],
					[face.uv[0]/texture_size[0], 1-(face.uv[3]/texture_size[1])],
					[face.uv[2]/texture_size[0], 1-(face.uv[3]/texture_size[1])]
				]
				var rot = (face.rotation+0)
				while (rot > 0) {
					let a = arr[0];
					arr[0] = arr[2];
					arr[2] = arr[3];
					arr[3] = arr[1];
					arr[1] = a;
					rot = rot-90;
				}
				return arr;
			}

			for (var face in s) {
				if (s.hasOwnProperty(face) && s[face].uv !== undefined) {
					var fIndex = 0;
					switch(face) {
						case 'north':   fIndex = 10;   break;
						case 'east':	fIndex = 0;	break;
						case 'south':   fIndex = 8;	break;
						case 'west':	fIndex = 2;	break;
						case 'up':	  fIndex = 4;	break;
						case 'down':	fIndex = 6;	break;
					}
					let uv_array = getUVArray(s[face]);
					mesh.geometry.attributes.uv.array.set(uv_array[0], fIndex*4 + 0);  //0,1
					mesh.geometry.attributes.uv.array.set(uv_array[1], fIndex*4 + 2);  //1,1
					mesh.geometry.attributes.uv.array.set(uv_array[2], fIndex*4 + 4);  //0,0
					mesh.geometry.attributes.uv.array.set(uv_array[3], fIndex*4 + 6);  //1,0
					mesh.geometry.attributes.uv.needsUpdate = true;
				}
			}

			scope.model.add(mesh);
		})
		scope.model.name = name;
		return this;
	}
	setModelVariant(variant) {
		this.variant = variant;
		this.model.children.forEach((m) => {
			if (m.r_model) {
				m.visible = m.r_model === variant;
			}
		})
		if (Modes.display && displayReferenceObjects.active === this) {
			this.updateBasePosition()
		}
	}
	load(index) {
		displayReferenceObjects.ref_indexes[DisplayMode.display_slot] = index || 0;
		displayReferenceObjects.clear()
		if (typeof this.updateBasePosition === 'function') {
			this.updateBasePosition()
		}
		//3D
		if (!this.initialized) {
			for (let model of this.models) {
				this.buildModel(model);
			}
			this.initialized = true;
		}
		scene.add(this.model)
		displayReferenceObjects.active = this;

		DisplayMode.vue.pose_angle = this.pose_angles[DisplayMode.display_slot] || 0;
		DisplayMode.vue.reference_model = this.id;

		if (DisplayMode.display_slot == 'groundTransform') {
			Canvas.ground_animation = true;
		}
		
		ReferenceImage.updateAll()
	}
}
export const displayReferenceObjects = {
	refmodels: {
		// Modified for Vintage Bench on 2026-06-22: expose Vintage Story preview targets without bundling game assets.
		seraph: new refModel('seraph', {
			icon: 'accessibility',
			models: []
		}),
		vs_armor_stand: new refModel('vs_armor_stand', {
			icon: 'fa-child',
			models: []
		}),
		mannequin: new refModel('mannequin', {
			icon: 'fa-person',
			models: []
		}),
		firstperson: new refModel('firstperson', {
			icon: 'fa-asterisk',
			models: [DisplayReferences.monitor]
		}),
		ground: new refModel('ground', {
			icon: 'fa-cube',
			models: [DisplayReferences.block]
		}),
		ground_storage: new refModel('ground_storage', {
			icon: 'fa-box',
			models: [DisplayReferences.block]
		}),
		tongs: new refModel('tongs', {
			icon: 'build',
			models: [DisplayReferences.monitor]
		}),
		tool_rack: new refModel('tool_rack', {
			icon: 'construction',
			models: [DisplayReferences.shelf]
		}),
		vertical_rack: new refModel('vertical_rack', {
			icon: 'view_agenda',
			models: [DisplayReferences.shelf]
		}),
		display_case: new refModel('display_case', {
			icon: 'inventory_2',
			models: [DisplayReferences.block]
		}),
		shelf: new refModel('shelf', {
			icon: 'table_view',
			models: [DisplayReferences.shelf]
		}),
		scroll_rack: new refModel('scroll_rack', {
			icon: 'receipt_long',
			models: [DisplayReferences.shelf]
		}),
		antler_mount: new refModel('antler_mount', {
			icon: 'wall_art',
			models: [DisplayReferences.block]
		}),
		inventory_nine: new refModel('inventory_nine', {
			icon: 'icon-inventory_nine',
			models: []
		}),
		inventory_full: new refModel('inventory_full', {
			icon: 'icon-inventory_full',
			models: []
		}),
		hud: new refModel('hud', {
			icon: 'icon-hud',
			models: []
		}),
		trap: new refModel('trap', {
			icon: 'select_all',
			models: [DisplayReferences.block]
		}),
		forge: new refModel('forge', {
			icon: 'local_fire_department',
			models: [DisplayReferences.block]
		}),
		omok_tabletop: new refModel('omok_tabletop', {
			icon: 'table_bar',
			models: [DisplayReferences.shelf]
		}),
		firepit: new refModel('firepit', {
			icon: 'whatshot',
			models: [DisplayReferences.block]
		})
	},
	active: '',
	bar: function(buttons) {
		buttons = buttons.filter(id => Condition(this.refmodels[id]));
		$('#display_ref_bar').html('');
		if (buttons.length < 2) {
			$('.reference_model_bar').css('visibility', 'hidden')
		} else {
			$('.reference_model_bar').css('visibility', 'visible')
		}
		var i = 0;
		while (i < buttons.length) {
			var ref = this.refmodels[buttons[i]]
			let icon = Blockbench.getIconNode(ref.icon);
			var button = $(
				`<div>
					<input class="hidden" type="radio" name="refmodel" id="${ref.id}"${ i === 0 ? ' selected' : '' }>
					<label class="tool" onclick="displayReferenceObjects.refmodels.${ref.id}.load(${i})" for="${ref.id}">
						<div class="tooltip">${ref.name}</div>
					</label>
				</div>`
			)
			button.find('> label.tool').append(icon);
			$('#display_ref_bar').append(button)
			if (i === displayReferenceObjects.ref_indexes[DisplayMode.display_slot]) {
				ref.load(i)
				button.find('input').prop("checked", true)
			}
			i++;
		}
	},
	clear: function() {
		if (displayReferenceObjects.active && displayReferenceObjects.active.shelf_displays) {
			displayReferenceObjects.active.shelf_displays.forEach(display => {
				display_area.remove(display);
			});
			displayReferenceObjects.active.shelf_displays = null;
			if (displayReferenceObjects.active.shelf_groups) {
				displayReferenceObjects.active.shelf_groups = null;
			}
		}
		if (displayReferenceObjects.active?.model) {
			scene.remove(displayReferenceObjects.active.model)
		}
		displayReferenceObjects.active = false
	},
	ref_indexes: Object.fromEntries(VS_DISPLAY_CONTEXTS.map(context => [context.id, 0])),
	slots: VS_DISPLAY_CONTEXTS.map(context => context.id)
}

display_area = new THREE.Object3D();
display_base = new THREE.Object3D();
display_area.add(display_base);
display_base.name = 'display_base';
display_area.name = 'display_area';

DisplayMode.slots = displayReferenceObjects.slots
DisplayMode.display_base = display_base;
DisplayMode.display_area = display_area;

export const display_angle_preset = {
	projection: 'perspective',
	position: [-80, 40, -30],
	target: [0, 8, 0],
	default: true
}

export function enterDisplaySettings() {		//Enterung Display Setting Mode, changes the scene etc
	unselectAllElements()

	if (Project.model_3d) display_base.add(Project.model_3d)
	if (!display_preview) {
		display_preview = new Preview({id: 'display'})
	}
	if (Preview.split_screen.enabled) {
		Preview.split_screen.before = Preview.split_screen.mode;
	}
	display_preview.fullscreen()

	Canvas.buildGrid()
	Canvas.updateShading()
	
	scene.add(display_area);
	if (Project.model_3d) {
		Project.model_3d.position.copy(Canvas.scene.position);
		Project.model_3d.position.y = -8;
	}
	scene.position.set(0, 0, 0);

	resizeWindow() //Update panels and sidebars so that the camera can be loaded with the correct aspect ratio
	DisplayMode.load(DisplayMode.display_slot)

	display_area.updateMatrixWorld()
	Transformer.center()
	if (Canvas.outlines.children.length) {
		Canvas.outlines.children.empty();
	}
}
export function exitDisplaySettings() {		//Enterung Display Setting Mode, changes the scene etc
	resetDisplayBase()
	displayReferenceObjects.clear();
	setDisplayArea(0,0,0, 0,0,0, 1,1,1)
	display_area.updateMatrixWorld()
	lights.rotation.set(0, 0, 0);
	Canvas.global_light_side = 0;
	Canvas.updateShading();
	scene.remove(display_area)
	if (!Format.centered_grid) scene.position.set(-8, 0, -8);
	display_base.children.forEachReverse(child => {
		display_base.remove(child);
		child.position.set(0, 0, 0);
	})
	if (Project.model_3d) {
		scene.add(Project.model_3d);
		Project.model_3d.position.set(0, 0, 0);
	}

	main_preview.fullscreen()

	resizeWindow()
	ReferenceImage.updateAll()
	if (Preview.split_screen.before) {
		Preview.split_screen.setMode(Preview.split_screen.before)
	}
	scene.add(Transformer)
	Canvas.buildGrid()
	Canvas.updateShading()
	Canvas.updateRenderSides()
}
export function resetDisplayBase() {
	display_base.rotation.x = Math.PI / (180 / 0.1);
	display_base.rotation.y = Math.PI / (180 / 0.1);
	display_base.rotation.z = Math.PI / (180 / 0.1);
	display_base.position.x = 0;
	display_base.position.y = 0;
	display_base.position.z = 0;
	display_base.scale.x = 1;
	display_base.scale.y = 1;
	display_base.scale.z = 1;
}

DisplayMode.updateDisplayBase = function(slot) {
	if (!slot) slot = Project.display_settings[DisplayMode.display_slot]
	if (!slot) return;

	display_base.rotation.x = Math.PI / (180 / slot.rotation[0]);
	display_base.rotation.y = Math.PI / (180 / slot.rotation[1]);
	display_base.rotation.z = Math.PI / (180 / slot.rotation[2]);

	display_base.position.x = slot.translation[0];
	display_base.position.y = slot.translation[1];
	display_base.position.z = slot.translation[2];

	let scale = slot.scale?.[0] || 0.001;
	display_base.scale.x = scale;
	display_base.scale.y = scale;
	display_base.scale.z = scale;

	if (slot.origin && !slot.origin.allEqual(0)) {
		// Modified for Vintage Bench on 2026-06-22: approximate Vintage Story ModelTransform origin in the Blockbench preview.
		let origin_offset = new THREE.Vector3().fromArray(slot.origin).multiplyScalar(16);
		let rotated_offset = origin_offset.clone().applyEuler(display_base.rotation).sub(origin_offset);
		display_base.position.sub(rotated_offset);
		display_base.position.add(origin_offset.clone().multiplyScalar(1 - scale));
	}

	Transformer.center()
}


DisplayMode.applyPreset = function(preset, all) {
	if (preset == undefined) return;
	var slots = [DisplayMode.display_slot];
	if (all) {
		slots = displayReferenceObjects.slots
	} else if (preset.areas[DisplayMode.display_slot] == undefined) {
		Blockbench.showQuickMessage('message.preset_no_info')
		return;
	};
	Undo.initEdit({display_slots: slots})
	slots.forEach(function(sl) {
		if (!Project.display_settings[sl]) {
			Project.display_settings[sl] = new DisplaySlot(sl)
		}
		let preset_values = preset.areas[sl];
		if (preset_values) {
			if (!preset_values.rotation_pivot) Project.display_settings[sl].rotation_pivot.replace([0, 0, 0]);
			if (!preset_values.scale_pivot) Project.display_settings[sl].scale_pivot.replace([0, 0, 0]);
			Project.display_settings[sl].extend(preset.areas[sl]);
		}
	})
	DisplayMode.updateDisplayBase()
	Undo.finishEdit('Apply display preset')
}
DisplayMode.loadJSON = function(data) {
	for (var slot in data) {
		if (displayReferenceObjects.slots.includes(slot)) {
			Project.display_settings[slot] = new DisplaySlot(slot).extend(data[slot])
		}
	}
}

var setDisplayArea = DisplayMode.setBase = function(x, y, z, rx, ry, rz, sx, sy, sz) {//Sets the Work Area to the given Space
	display_area.rotation['x'] = Math.PI / (180 / rx);
	display_area.rotation['y'] = Math.PI / (180 / ry);
	display_area.rotation['z'] = Math.PI / (180 / rz);

	display_area.position['x'] = x;
	display_area.position['y'] = y;
	display_area.position['z'] = z;

	display_area.scale['x'] = sx;
	display_area.scale['y'] = sy;
	display_area.scale['z'] = sz;

	display_area.updateMatrixWorld()

	Transformer.center()
}
DisplayMode.groundAnimation = function() {
	display_area.rotation.y += 0.015
	ground_timer += 1;
	let ground_offset = 1.9 + display_base.scale.y * 3.6;
	display_area.position.y = ground_offset + Math.sin(Math.PI * (ground_timer / 100)) * Math.PI/2
	Transformer.center()
	if (ground_timer === 200) ground_timer = 0;
}
DisplayMode.updateGUILight = function() {
	if (!Modes.display) return;
	lights.rotation.set(0, 0, 0);
	Canvas.global_light_side = 0;
	Canvas.updateShading();
} 

export function loadDisp(key) {	//Loads The Menu and slider values, common for all Radio Buttons
	DisplayMode.display_slot = key

	if (key !== 'gui' && display_preview.isOrtho === true) {
		display_preview.loadAnglePreset(display_angle_preset)
	}
	display_preview.controls.enabled = true;
	Canvas.ground_animation = false;
	$('.display_crosshair').detach()
	if (display_preview.orbit_gizmo) display_preview.orbit_gizmo.unhide();
	display_preview.camPers.setFocalLength(45)

	if (Project.display_settings[key] == undefined) {
		Project.display_settings[key] = new DisplaySlot(key)
	}
	display_preview.force_locked_angle = false;
	DisplayMode.vue._data.slot = Project.display_settings[key]
	DisplayMode.slot = Project.display_settings[key]
	DisplayMode.vue.$forceUpdate();
	DisplayMode.updateDisplayBase();
	Canvas.updateRenderSides();
	DisplayMode.updateGUILight();
	Toolbars.display.update();
	updateGUISlotCrop();
}
export function getOptimalFocalLength() {
	if (display_preview.camera.aspect > 1.7) {
		return 18 / display_preview.camera.aspect;
	} else if (display_preview.camera.aspect > 1.0) {
		return 16.57 + -3.57 * display_preview.camera.aspect;
	} else {
		return 13 * display_preview.camera.aspect;
	}
}
function loadVintageStoryContext(context_id) {
	let context = getVintageStoryDisplayContext(context_id) || VS_DISPLAY_CONTEXTS[0];
	loadDisp(context.id);
	warnAboutMissingVintageStoryPreviewAssets(context.references || []);

	if (context.id === 'guiTransform') {
		display_preview.loadAnglePreset({
			projection: 'orthographic',
			position: [0, 0, 32],
			target: [0, 0, 0],
			locked_angle: 'south',
			zoom: 1,
		});
		if (display_preview.orbit_gizmo) display_preview.orbit_gizmo.hide();
	} else if (context.id === 'fpHandTransform' || context.id === 'fpOffHandTransform' || context.id === 'onTongTransform') {
		display_preview.loadAnglePreset({
			position: [0, 24, 32.4],
			target: [0, 24, 0],
			focal_length: getOptimalFocalLength(),
		});
		display_preview.controls.enabled = false;
		if (display_preview.orbit_gizmo) display_preview.orbit_gizmo.hide();
		$('.single_canvas_wrapper').append('<div class="display_crosshair"></div>');
	} else if (context.section === 'Ground' || context.section === 'Other') {
		display_preview.loadAnglePreset({
			position: [-40, 37, -40],
			target: [0, 6, 0]
		});
		Canvas.ground_animation = context.id === 'groundTransform';
		ground_timer = 0;
	} else {
		display_preview.loadAnglePreset({
			position: [-44, 40, -44],
			target: [0, 14, 0]
		});
	}
	displayReferenceObjects.bar(context.references || ['ground']);
}
DisplayMode.loadContext = loadVintageStoryContext;
DisplayMode.load = loadVintageStoryContext;

DisplayMode.loadThirdRight = function() { DisplayMode.load('tpHandTransform') }
DisplayMode.loadThirdLeft = function() { DisplayMode.load('tpOffHandTransform') }
DisplayMode.loadFirstRight = function() { DisplayMode.load('fpHandTransform') }
DisplayMode.loadFirstLeft = function() { DisplayMode.load('fpOffHandTransform') }
DisplayMode.loadGUI = function() { DisplayMode.load('guiTransform') }
DisplayMode.loadGround = function() { DisplayMode.load('groundTransform') }
DisplayMode.loadShelf = function() { DisplayMode.load('onshelfTransform') }
DisplayMode.updateShelfAlignment = function() {};

DisplayMode.copy = function() {
	Clipbench.display_slot = DisplayMode.slot.copy()
}
DisplayMode.paste = function() {
	Undo.initEdit({display_slots: [DisplayMode.display_slot]})
	DisplayMode.slot.extend(Clipbench.display_slot)
	DisplayMode.updateDisplayBase()
	Undo.finishEdit('Paste display slot')
}

DisplayMode.scrollSlider = function(type, value, el) {
	Undo.initEdit({display_slots: [DisplayMode.display_slot]})

	var [channel, axis] = type.split('.')
	if (channel === 'scale') {
		let scale = limitNumber(parseFloat(value), 0, 6) || 0;
		DisplayMode.slot.scale[0] = scale;
		DisplayMode.slot.scale[1] = scale;
		DisplayMode.slot.scale[2] = scale;
	} else {
		DisplayMode.slot[channel][parseInt(axis)] = value
	}

	DisplayMode.slot.update()
	Undo.finishEdit('Change display slot')
}

let clip_planes = [
	new THREE.Plane(new THREE.Vector3(1, 0, 0), 3.2001),
	new THREE.Plane(new THREE.Vector3(-1, 0, 0), 3.2001),
	new THREE.Plane(new THREE.Vector3(0, 1, 0), 3.2001),
	new THREE.Plane(new THREE.Vector3(0, -1, 0), 3.2001)
];
function updateGUISlotCrop() {
	if (!display_preview?.canvas) return;
	// Modified for Vintage Bench on 2026-06-22: Java model GUI clipping does not apply to Vintage Story display transforms.
	for (let texture of Texture.all) {
		texture.material.clippingPlanes = null;
	}
	if (Preview.selected?.renderer) {
		Preview.selected.renderer.localClippingEnabled = false;
	}
}
Blockbench.on('update_camera_position', e => {
	if (Modes.display) {
		updateGUISlotCrop();
	}
})

export function changeDisplaySkin() {
	// Modified for Vintage Bench on 2026-06-22: Minecraft skin switching is replaced by local Vintage Story asset-path setup.
	Blockbench.showQuickMessage(tl('message.vintage_story_assets.configure'), 3000);
}
export function updateDisplaySkin(feedback) {
	return feedback;
}
DisplayMode.updateDisplaySkin = updateDisplaySkin;

DisplayMode.debugBase = function() {
	new Dialog('display_base_debug', {
		title: 'Debug Display Base',
		darken: false,
		form: {
			translation: {type: 'vector', dimensions: 3, step: 0.1, value: [0, 0, 0], label: 'Translation'},
			rotation: {type: 'vector', dimensions: 3, step: 0.5, value: [0, 0, 0], label: 'Rotation'},
			scale: {type: 'vector', dimensions: 3, step: 0.05, value: [1, 1, 1], label: 'Scale'},
		},
		onFormChange(result) {
			DisplayMode.setBase(...result.translation, ...result.rotation, ...result.scale)
		}
	}).show();
}


const display_gui_rotation = new THREE.Object3D();
display_gui_rotation.rotation.set(0.2, 0.2, 0);
display_gui_rotation.updateMatrixWorld();

new TransformerModule('display', {
	priority: 2,
	condition: () => Modes.display,
	updateGizmo() {

		let transformer_mode = Toolbox.selected.transformerMode;

		Transformer.attach(display_base)

		display_base.getWorldPosition(Transformer.position);
		Transformer.position.sub(scene.position);

		// todo: Fix positions when both rotation pivot and scale pivot are used
		if (transformer_mode === 'translate') {
			Transformer.rotation_ref = display_area;

		} else if (transformer_mode === 'scale') {
			if (DisplayMode.slot.origin) {
				let pivot_offset = new THREE.Vector3().fromArray(DisplayMode.slot.origin).multiplyScalar(-16);
				pivot_offset.multiplyScalar(DisplayMode.slot.scale[0]);
				pivot_offset.applyQuaternion(display_base.getWorldQuaternion(new THREE.Quaternion()));
				Transformer.position.sub(pivot_offset);
			}

			Transformer.rotation_ref = display_base;

		} else if (transformer_mode === 'rotate') {
			if (DisplayMode.slot.origin) {
				let pivot_offset = new THREE.Vector3().fromArray(DisplayMode.slot.origin).multiplyScalar(-16);
				pivot_offset.applyQuaternion(display_base.getWorldQuaternion(new THREE.Quaternion()));
				Transformer.position.sub(pivot_offset);
			}

			if (DisplayMode.display_slot == 'guiTransform') {
				Transformer.rotation_ref = display_gui_rotation;
			}
		}
	},
	calculateOffset(context) {
		let {point, axis, axis_number, angle} = context;
		
		let {display_slot} = DisplayMode;
		var rotation = new THREE.Quaternion()
		Transformer.getWorldQuaternion(rotation)
		point.applyQuaternion(rotation.invert())

		var channel = Toolbox.selected.animation_channel
		if (channel === 'position') channel = 'translation';
		var value = point[axis]
		if (axis == 'e') value = point.length() * Math.sign(point.y||point.x);
		var bf = (Project.display_settings[display_slot][channel][axis_number] - (this.previous_value||0)) || 0;

		if (channel === 'rotation') {
			value = Math.trimDeg(bf + Math.round(angle*4)/4) - bf;
		} else if (channel === 'translation') {
			value = limitNumber( bf+Math.round(value*4)/4, -80, 80) - bf;
		} else /* scale */ {
			value = limitNumber( bf+Math.round(value*64)/(64*8)*context.direction, 0, 4) - bf;
		}
		return value;
	},
	onStart() {
		Undo.initEdit({display_slots: [DisplayMode.display_slot]})
	},
	onMove(context) {
		let {point, axis, axis_number, value} = context;
		var channel = Toolbox.selected.animation_channel
		if (channel === 'position') channel = 'translation';

		var difference = value - (this.previous_value||0);

		if (channel === 'rotation') {
			let normal = Reusable.vec1.copy(Transformer.axis == 'E'
				? rotate_normal
				: axis_number == 0 ? THREE.NormalX : (axis_number == 1 ? THREE.NormalY : THREE.NormalZ));

			let quaternion = display_base.getWorldQuaternion(new THREE.Quaternion()).invert()
			normal.applyQuaternion(quaternion)
			display_base.rotateOnAxis(normal, Math.degToRad(difference))

			DisplayMode.slot[channel][0] = Math.roundTo(Math.radToDeg(display_base.rotation.x), 2);
			DisplayMode.slot[channel][1] = Math.roundTo(Math.radToDeg(display_base.rotation.y), 2);
			DisplayMode.slot[channel][2] = Math.roundTo(Math.radToDeg(display_base.rotation.z), 2);

		} else if (channel === 'scale' || axis == 'e') {
			let val = DisplayMode.slot[channel][(axis_number || 0)] + difference;
			if (channel === 'scale') val = limitNumber(val, 0, 6);
			DisplayMode.slot[channel][0] = val;
			DisplayMode.slot[channel][1] = val;
			DisplayMode.slot[channel][2] = val;

		} else {
			DisplayMode.slot[channel][axis_number] += difference;
		}
		DisplayMode.slot.update()

		Blockbench.setCursorTooltip(trimFloatNumber(value - this.initial_value));

	},
	onEnd(context) {
		if (context.keep_changes) {
			Undo.finishEdit('Edit display slot');
		}
	},
	onCancel() {
		Undo.cancelEdit(true);
	},
});


BARS.defineActions(function() {
	new Mode('display', {
		icon: 'tune',
		selectElements: false,
		default_tool: 'move_tool',
		category: 'navigate',
		condition: () => Format.display_mode,
		onSelect: () => {
			enterDisplaySettings()
		},
		onUnselect: () => {
			exitDisplaySettings()
		},
	})

	new Action('add_display_preset', {
		icon: 'add',
		category: 'display',
		condition: {modes: ['display']},
		click() {
			let form = {
				name: {label: 'generic.name', type: 'text', placeholder: tl('display.preset.blank_name')},
				_: '_',
				info: {type: 'info', text: 'dialog.display_preset.message'},
			};
			VS_DISPLAY_CONTEXTS.filter(context => !context.previewOnly).forEach(context => {
				form[context.id] = {type: 'checkbox', label: context.label, value: true};
			});
			new Dialog({
				id: 'display_preset',
				title: 'dialog.display_preset.title',
				width: 300,
				form,
				onConfirm(form_data) {
					let preset = {
						name: form_data.name || tl('display.preset.blank_name'),
						areas: {}
					}
					display_presets.push(preset);

					displayReferenceObjects.slots.forEach((s) => {
						if (form_data[s] && Project.display_settings[s]) {
							preset.areas[s] = Project.display_settings[s].copy();
						}
					})
					localStorage.setItem('display_presets', JSON.stringify(display_presets));
				}
			}).show();
		}
	})
	new Action('apply_display_preset', {
		icon: 'fa-list',
		category: 'display',
		condition: {modes: ['display']},
		click: function (e) {
			new Menu('apply_display_preset', this.children(), {searchable: true}).open(e.target);
		},
		children: function() {
			var presets = []
			display_presets.forEach(function(p) {
				var icon = 'label'
				if (p.fixed) {
					switch(p.id) {
						case 'vintage_story_neutral': icon = 'tune'; break;
					}
				}
				presets.push({
					icon: icon,
					name: p.id ? tl('display.preset.'+p.id) : p.name,
					click() {
						DisplayMode.applyPreset(p)
					},
					children: [
						{name: 'action.apply_display_preset.here', icon: 'done', click() {
							DisplayMode.applyPreset(p)
						}},
						{name: 'action.apply_display_preset.everywhere', icon: 'done_all', click() {
							DisplayMode.applyPreset(p, true)
						}},
						{
							icon: 'delete',
							name: 'generic.delete',
							condition: !p.fixed,
							click: function() {
								display_presets.splice(display_presets.indexOf(p), 1);
								localStorage.setItem('display_presets', JSON.stringify(display_presets))
							}
						}
					]
				})
			})
			return presets;
		}
	})

})

Interface.definePanels(function() {
	
	new Panel('display', {
		icon: 'tune',
		condition: {modes: ['display']},
		default_position: {
			slot: 'left_bar',
			float_position: [0, 0],
			float_size: [300, 400],
			height: 400,
			sidebar_index: 0,
		},
		toolbars: [
			new Toolbar({
				id: 'display',
				children: [
					'copy',
					'paste',
					'add_display_preset',
					'apply_display_preset'
				]
			})
		],
		component: DisplayModePanel
	})
	DisplayMode.vue = Interface.Panels.display.inside_vue;
})


Object.assign(window, {
	DisplayMode,
	DisplaySlot,
	display_angle_preset,
	resetDisplayBase,
	updateDisplaySkin,
	displayReferenceObjects,
	changeDisplaySkin,
});
