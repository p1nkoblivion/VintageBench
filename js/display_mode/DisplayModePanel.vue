<template>
	<div>
		<div class="toolbar_wrapper display"></div>

		<p class="panel_toolbar_label">{{ tl('display.slot') }}</p>
		<div id="display_bar" class="vintage_display_sections">
			<div class="vintage_display_section" v-for="section in display_sections" :key="section.id">
				<p class="panel_toolbar_label">{{ section.label }}</p>
				<div class="bar tabs_small icon_bar vintage_display_contexts">
					<template v-for="context in section.contexts">
						<input class="hidden" type="radio" name="display" :id="'display_'+context.id" :checked="active_context === context.id" :key="'input_'+context.id" />
						<label class="tool" :for="'display_'+context.id" @click="loadSlot(context.id)" :key="'label_'+context.id">
							<div class="tooltip">{{ context.label }}</div>
							<i class="material-icons">{{ context.icon || 'tune' }}</i>
						</label>
					</template>
				</div>
			</div>
		</div>

		<p class="panel_toolbar_label">{{ tl('display.reference') }}</p>
		<div id="display_ref_bar" class="bar tabs_small icon_bar"></div>

		<div v-if="asset_source" class="vintage_asset_context_notice">
			<div class="vintage_asset_context_status">
				<label>{{ asset_source_info.label }}</label>
				<span>{{ asset_source_info.path }}</span>
			</div>
			<div v-if="asset_source.inherited && asset_source.editMode !== 'shared'" class="bar vintage_asset_context_actions">
				<div class="tool wide" @click="createAssetOverride">{{ tl('display.vintage_story_asset.create_override') }}</div>
				<div class="tool wide" @click="editAssetSharedRule">{{ tl('display.vintage_story_asset.edit_shared') }}</div>
			</div>
			<div v-else-if="asset_source.isByType && !asset_source.inherited" class="bar vintage_asset_context_actions">
				<div class="tool wide" @click="deleteAssetOverride">{{ tl('display.vintage_story_asset.delete_override') }}</div>
			</div>
		</div>
		<div v-else-if="raw_shape_warning" class="vintage_asset_context_notice warning">
			{{ tl('display.vintage_story_asset.raw_shape_warning') }}
		</div>

		<div id="display_sliders">
			<div class="bar display_slot_section_bar">
				<p class="panel_toolbar_label">{{ tl('display.rotation') }}</p>
				<div class="tool head_right" @click="resetChannel('rotation')"><i class="material-icons">replay</i></div>
			</div>
			<div class="bar slider_input_combo" v-for="axis in axes" :key="'rotation.'+axis" :title="getAxisLetter(axis).toUpperCase()">
				<input type="range" :style="{'--color-thumb': `var(--color-axis-${getAxisLetter(axis)})`}" class="tool disp_range" v-model.number="slot.rotation[axis]" :trigger_type="'rotation.'+axis"
					min="-180" max="180" step="1"
					@input="change(axis, 'rotation')" @mousedown="start()" @change="save()" />
				<numeric-input class="tool disp_text" v-model.number="slot.rotation[axis]" :min="-180" :max="180" :step="0.5" @input="change(axis, 'rotation')" @change="focusout(axis, 'rotation');save()" @mousedown="start()" />
			</div>

			<div class="bar display_slot_section_bar">
				<p class="panel_toolbar_label">{{ tl('display.translation') }}</p>
				<div class="tool head_right" @click="resetChannel('translation')"><i class="material-icons">replay</i></div>
			</div>
			<div class="bar slider_input_combo" v-for="axis in axes" :key="'translation.'+axis" :title="getAxisLetter(axis).toUpperCase()">
				<input type="range" :style="{'--color-thumb': `var(--color-axis-${getAxisLetter(axis)})`}" class="tool disp_range" v-model.number="slot.translation[axis]" :trigger_type="'translation.'+axis"
					:min="Math.abs(slot.translation[axis]) < 10 ? -20 : (slot.translation[axis] > 0 ? -200 : -80)"
					:max="Math.abs(slot.translation[axis]) < 10 ? 20 : (slot.translation[axis] < 0 ? 200 : 80)"
					:step="Math.abs(slot.translation[axis]) < 10 ? 0.25 : 1"
					@input="change(axis, 'translation')" @mousedown="start()" @change="save()" />
				<numeric-input class="tool disp_text" v-model.number="slot.translation[axis]" :min="-80" :max="80" :step="0.25" @input="change(axis, 'translation')" @change="focusout(axis, 'translation');save()" @mousedown="start()" />
			</div>

			<div class="bar display_slot_section_bar">
				<p class="panel_toolbar_label">{{ tl('display.origin') }}</p>
				<div class="tool head_right" @click="resetChannel('origin')"><i class="material-icons">replay</i></div>
			</div>
			<div class="bar slider_input_combo" v-for="axis in axes" :key="'origin.'+axis" :title="getAxisLetter(axis).toUpperCase()">
				<input type="range" :style="{'--color-thumb': `var(--color-axis-${getAxisLetter(axis)})`}" class="tool disp_range" v-model.number="slot.origin[axis]" :trigger_type="'origin.'+axis"
					min="-16" max="16" step="0.05"
					@input="change(axis, 'origin')" @mousedown="start()" @change="save()" />
				<numeric-input class="tool disp_text" v-model.number="slot.origin[axis]" :min="-16" :max="16" :step="0.05" @input="change(axis, 'origin')" @change="focusout(axis, 'origin');save()" @mousedown="start()" />
			</div>

			<div class="bar display_slot_section_bar">
				<p class="panel_toolbar_label">{{ tl('display.scale') }}</p>
				<div class="tool head_right" @click="resetChannel('scale')"><i class="material-icons">replay</i></div>
			</div>
			<div class="bar slider_input_combo" title="Scale">
				<input type="range" class="tool disp_range scaleRange" v-model.number="uniform_scale" trigger_type="scale.0"
					min="0" max="6" step="0.01"
					@input="changeUniformScale()" @mousedown="start()" @change="save()" />
				<numeric-input class="tool disp_text" v-model.number="uniform_scale" :min="0" :max="6" :step="0.01" @input="changeUniformScale()" @change="focusout(0, 'scale');save()" @mousedown="start()" />
			</div>

			<template v-if="slot.slot_id == 'groundTransform'">
				<div class="bar display_slot_section_bar">
					<p class="panel_toolbar_label">{{ tl('display.animate_preview') }}</p>
				</div>
				<div class="bar slider_input_combo">
					<input type="checkbox" v-model.number="animate_preview" />
				</div>
			</template>
		</div>
	</div>
</template>

<script lang="js">
import { DisplayMode, DisplaySlot, displayReferenceObjects } from './display_mode';
import { VS_DISPLAY_SECTIONS } from './vintage_story_display_transforms';
import { tl } from '../languages';

export default {
	data() {return {
		axes: [0, 1, 2],
		display_sections: VS_DISPLAY_SECTIONS,
		reference_model: '',
		slot: new DisplaySlot('tpHandTransform'),
		animate_preview: DisplayMode.animate_preview
	}},
	computed: {
		uniform_scale: {
			get() {
				return this.slot.scale?.[0] ?? 1;
			},
			set(value) {
				let val = limitNumber(parseFloat(value), 0, 6) || 0;
				this.slot.scale[0] = val;
				this.slot.scale[1] = val;
				this.slot.scale[2] = val;
			}
		},
		asset_source() {
			return this.slot?.vintage_story?.asset_source || null;
		},
		asset_source_info() {
			return DisplayMode.describeVintageStoryAssetSource?.(this.slot.slot_id) || {label: '', path: ''};
		},
		raw_shape_warning() {
			return DisplayMode.isRawVintageStoryShapeMode?.();
		},
		active_context() {
			return DisplayMode.active_context || this.slot?.slot_id;
		}
	},
	watch: {
		animate_preview(value) {
			DisplayMode.animate_preview = value;
		}
	},
	methods: {
		tl,
		loadSlot(id) {
			DisplayMode.load(id);
		},
		change(axis, channel) {
			if (channel === 'scale') {
				this.changeUniformScale();
			}
			DisplayMode.updateDisplayBase();
		},
		changeUniformScale() {
			let val = limitNumber(parseFloat(this.slot.scale[0]), 0, 6) || 0;
			this.slot.scale[0] = val;
			this.slot.scale[1] = val;
			this.slot.scale[2] = val;
			DisplayMode.updateDisplayBase();
		},
		focusout(axis, channel) {
			if (channel === 'scale') {
				this.changeUniformScale();
			} else if (channel === 'translation') {
				DisplayMode.slot.translation[axis] = limitNumber(DisplayMode.slot.translation[axis], -80, 80) || 0;
			} else if (channel === 'rotation') {
				DisplayMode.slot.rotation[axis] = Math.trimDeg(DisplayMode.slot.rotation[axis]) || 0;
			} else if (channel === 'origin') {
				DisplayMode.slot.origin[axis] = limitNumber(DisplayMode.slot.origin[axis], -16, 16) || 0;
			}
			DisplayMode.updateDisplayBase();
		},
		resetChannel(channel) {
			let v = channel === 'scale' ? 1 : 0;
			Undo.initEdit({display_slots: [DisplayMode.display_slot]});
			DisplayMode.ensureVintageStoryAssetTransformEditTarget();
			DisplayMode.slot.extend({[channel]: [v, v, v]});
			DisplayMode.markVintageStoryAssetTransformEdited();
			Undo.finishEdit('Reset display channel');
		},
		start() {
			Undo.initEdit({display_slots: [DisplayMode.display_slot]});
			DisplayMode.ensureVintageStoryAssetTransformEditTarget();
		},
		save() {
			DisplayMode.markVintageStoryAssetTransformEdited();
			Undo.finishEdit('Change display setting');
		},
		createAssetOverride() {
			DisplayMode.createVintageStoryAssetTransformOverride?.(this.slot.slot_id);
		},
		editAssetSharedRule() {
			DisplayMode.editVintageStoryAssetSharedRule?.(this.slot.slot_id);
		},
		deleteAssetOverride() {
			DisplayMode.deleteVintageStoryAssetTransformOverride?.(this.slot.slot_id);
		},
		getAxisLetter
	},
}
</script>
