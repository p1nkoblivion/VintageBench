BARS.defineActions(() => {
	new Action('about_window', {
		name: tl('dialog.settings.about') + '...',
		description: `Vintage Bench ${Blockbench.version}`,
		icon: 'info',
		category: 'blockbench',
		click: function () {
			const data = {
				isApp,
				version_label: Blockbench.version
			};

			new Dialog({
				id: 'about',
				title: 'dialog.settings.about',
				width: 640,
				title_menu: new Menu([
					'settings_window',
					'keybindings_window',
					'theme_window',
					'about_window',
				]),
				buttons: [],
				component: {
					data() {return data},
					template: `
						<div>
							<div class="blockbench_logo" id="about_page_title">
								<h1>Vintage Bench</h1>
							</div>
							<p>Version <span>{{ version_label }}</span></p>

							<p>Vintage Story JSON asset workspace for cuboid model editing.</p>
							<p style="color: var(--color-subtle_text);">This build opens and saves Vintage Story shape JSON, links item/block asset context, resolves variants and ByType maps, manages textures, display transforms, interaction boxes, attachments, shape alternates, behavior templates, advanced JSON, validation, backups, and mod workspace packaging.</p>

							<h4>FORK NOTICE</h4>
							<p>Vintage Bench is a modified fork of Blockbench. Original Blockbench copyright notices are retained from the original project and its contributors.</p>
							<p>Modified-work notice: Vintage Bench changes began on 2026-06-22 and continue through later release commits.</p>
							<p>Vintage Bench modifications Copyright (C) 2026 P1nkOblivion.</p>
							<p>Licensed under the GNU General Public License version 3. You may redistribute and modify Vintage Bench under GPL-3.0. See LICENSE.MD in the source tree or installed application files for the full license text.</p>
							<p>This program comes with ABSOLUTELY NO WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.</p>
							<p>Source code: <a class="open-in-browser" href="https://github.com/p1nkoblivion/VintageBench">github.com/p1nkoblivion/VintageBench</a></p>
							<p>No additional EULA or release terms may restrict GPL redistribution, modification, or source-code access rights.</p>
							<p>User-created models, textures, animations, screenshots, mods, and other assets remain owned by their creators and are not automatically licensed under GPL by using Vintage Bench.</p>
							<p>No proprietary Vintage Story game assets are bundled. Preview references are placeholders, original calibration backdrops, or loaded from a user-selected local Vintage Story installation at runtime.</p>
							<p>Vintage Bench is not affiliated with, endorsed by, or sponsored by the original Blockbench project or by the owners or developers of Vintage Story.</p>

							<h4>FRAMEWORKS, LIBRARIES, AND ICONS</h4>

							<p style="margin-bottom: 16px" v-if="isApp">This program is powered by <a class="open-in-browser" href="https://electronjs.org">Electron</a></p>

							<ul class="multi_column_list">
								<li><a class="open-in-browser" href="https://material.io/icons/">Material Icons</a></li>
								<li><a class="open-in-browser" href="https://fontawesome.com/icons/">Font Awesome</a></li>
								<li><a class="open-in-browser" href="https://github.com/microsoft/vscode-codicons">VSCode Codicons</a></li>
								<li><a class="open-in-browser" href="https://electronjs.org">Electron</a></li>
								<li><a class="open-in-browser" href="https://vuejs.org">Vue</a></li>
								<li><a class="open-in-browser" href="https://github.com/weibangtuo/vue-tree">Vue Tree</a></li>
								<li><a class="open-in-browser" href="https://github.com/sagalbot/vue-sortable">Vue Sortable</a></li>
								<li><a class="open-in-browser" href="https://threejs.org">ThreeJS</a></li>
								<li><a class="open-in-browser" href="https://github.com/lo-th/fullik">Full IK</a></li>
								<li><a class="open-in-browser" href="https://bgrins.github.io/spectrum">Spectrum</a></li>
								<li><a class="open-in-browser" href="https://github.com/stijlbreuk/vue-color-picker-wheel">Vue Color Picker Wheel</a></li>
								<li><a class="open-in-browser" href="https://github.com/jnordberg/gif.js">gif.js</a></li>
								<li><a class="open-in-browser" href="https://github.com/mattdesl/gifenc">gifenc</a></li>
								<li><a class="open-in-browser" href="https://stuk.github.io/jszip/">JSZip</a></li>
								<li><a class="open-in-browser" href="https://github.com/rotemdan/lzutf8.js">LZ-UTF8</a></li>
								<li><a class="open-in-browser" href="https://jquery.com">jQuery</a></li>
								<li><a class="open-in-browser" href="https://jqueryui.com">jQuery UI</a></li>
								<li><a class="open-in-browser" href="https://github.com/furf/jquery-ui-touch-punch">jQuery UI Touch Punch</a></li>
								<li><a class="open-in-browser" href="https://github.com/eligrey/FileSaver.js">FileSaver.js</a></li>
								<li><a class="open-in-browser" href="https://github.com/AndrewRayCode/easing-utils">easing-utils</a></li>
								<li><a class="open-in-browser" href="https://peerjs.com">PeerJS</a></li>
								<li><a class="open-in-browser" href="https://github.com/markedjs/marked">Marked</a></li>
								<li><a class="open-in-browser" href="https://github.com/cure53/DOMPurify">DOMPurify</a></li>
								<li><a class="open-in-browser" href="https://prismjs.com">Prism</a></li>
								<li><a class="open-in-browser" href="https://github.com/akalverboer/canvas2apng">Canvas2APNG</a></li>
								<li><a class="open-in-browser" href="https://github.com/lunapaint/tga-codec">lunapaint/tga-codec</a></li>
								<li><a class="open-in-browser" href="https://github.com/koca/vue-prism-editor">Vue Prism Editor</a></li>
								<li><a class="open-in-browser" href="https://github.com/JannisX11/molangjs">MolangJS</a></li>
								<li><a class="open-in-browser" href="https://github.com/JannisX11/wintersky">Wintersky</a></li>
							</ul>

							<p style="margin-top: 20px">Released under the GPL 3.0 license. See LICENSE.MD.</p>

						</div>`
				}
			}).show()
		}
	})
})
