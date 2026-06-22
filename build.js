import * as esbuild from 'esbuild'
import { glsl } from "esbuild-plugin-glsl";
import { createRequire } from "module";
import commandLineArgs from 'command-line-args'
import path from 'path';
import { writeFileSync } from 'fs';
import fs from 'node:fs';
import { compileStyle, compileTemplate, parseComponent } from '@vue/compiler-sfc';
const require = createRequire(import.meta.url);
const pkg = require("./package.json");

const options = commandLineArgs([
    {name: 'target', type: String},
    {name: 'watch', type: Boolean},
    {name: 'serve', type: Boolean},
    {name: 'host', type: String},
    {name: 'port', type: Number},
    {name: 'analyze', type: Boolean},
])

function conditionalImportPlugin(name, config) {
    return {
        name: 'conditional-import-plugin-'+name,
        /**
         * @param {esbuild.PluginBuild} build 
         */
        setup(build) {
            build.onResolve({ filter: config.filter }, args => {
                if (config.library) {
                    return { path: path.join( import.meta.dirname, 'node_modules', path.dirname(args.path), config.file) };
                } else {
                    return { path: path.join(args.resolveDir, path.dirname(args.path), config.file) };
                }
            });
        }
    };
};
function createJsonPlugin(ext_suffix, namespace) {
    return {
        name: `${namespace}-plugin`,
        setup(build) {
            // Intercept import paths with the specified extension
            build.onResolve({ filter: new RegExp(`${ext_suffix}$`) }, args => ({
                path: path.join(
                    args.resolveDir,
                    args.path
                ),
                namespace: `${namespace}-ns`,
            }))

            // Load paths tagged with the specified namespace and treat them as JSON
            build.onLoad({ filter: /.*/, namespace: `${namespace}-ns` }, async (args) => {
                // Read the content of the file
                const content = await fs.promises.readFile(args.path, 'utf8');

                // Return the content as JSON
                return {
                    contents: content,
                    loader: 'json',
                }
            })
        }
    };
};
// Modified for Vintage Bench on 2026-06-22: replace esbuild-vue to remove vulnerable Vue 2 template-compiler dependencies.
function createVueSfcPlugin() {
    return {
        name: 'vintage-bench-vue-sfc-plugin',
        setup(build) {
            build.onLoad({filter: /\.vue$/}, async (args) => {
                const source = await fs.promises.readFile(args.path, 'utf8');
                const descriptor = parseComponent(source, {filename: args.path});
                if (descriptor.errors?.length) {
                    throw new Error(descriptor.errors.map(error => error.message || String(error)).join('\n'));
                }

                const id = `data-v-${Buffer.from(path.relative(import.meta.dirname, args.path)).toString('hex').slice(0, 8)}`;
                let contents = descriptor.script?.content || 'export default {}';
                contents = contents.replace(/export\s+default/, 'const __vue_script__ =');
                if (!contents.includes('const __vue_script__ =')) {
                    contents += '\nconst __vue_script__ = {};\n';
                }

                if (descriptor.template) {
                    const template = compileTemplate({
                        source: descriptor.template.content,
                        filename: args.path,
                        id,
                        compilerOptions: {
                            preserveWhitespace: false
                        }
                    });
                    if (template.errors?.length) {
                        throw new Error(template.errors.map(error => error.message || String(error)).join('\n'));
                    }
                    contents += `\n${template.code}\n`;
                } else {
                    contents += '\nconst render = undefined;\nconst staticRenderFns = [];\n';
                }

                let css = '';
                for (const styleBlock of descriptor.styles || []) {
                    const style = compileStyle({
                        source: styleBlock.content,
                        filename: args.path,
                        id,
                        scoped: !!styleBlock.scoped
                    });
                    if (style.errors?.length) {
                        throw new Error(style.errors.map(error => error.message || String(error)).join('\n'));
                    }
                    css += style.code + '\n';
                }
                if (css) {
                    contents += `
const __vue_css__ = ${JSON.stringify(css)};
if (typeof document !== 'undefined') {
    const __vue_style__ = document.createElement('style');
    __vue_style__.textContent = __vue_css__;
    document.head.appendChild(__vue_style__);
}
`;
                }

                if (descriptor.styles?.some(styleBlock => styleBlock.scoped)) {
                    contents += `\n__vue_script__._scopeId = ${JSON.stringify(id)};\n`;
                }
                contents += '\n__vue_script__.render = render;\n__vue_script__.staticRenderFns = staticRenderFns;\nexport default __vue_script__;\n';

                return {
                    contents,
                    loader: 'js',
                    resolveDir: path.dirname(args.path)
                };
            });
        }
    };
};

if (options.target && options.target !== 'electron') {
    throw new Error('Vintage Bench only supports the desktop Electron build target in this cleanup pass.');
}
options.target = 'electron';

const isApp = true;
const dev_mode = options.watch || options.serve;
const minify = !dev_mode;

/**
 * @type {esbuild.BuildOptions} BuildOptions
 */
const config = {
    entryPoints: ['./js/main.js'],
    define: {
        isApp: isApp.toString(),
        appVersion: `"${pkg.version}"`,
    },
    platform: 'node',
    target: 'es2020',
    format: 'esm',
    bundle: true,
    minify,
    outfile: './dist/bundle.js',
    mainFields: ['module', 'main'],
    logLevel: 'info',
    logOverride: {
        'commonjs-variable-in-esm': 'silent'
    },
    external: [
        'electron',
    ],
    loader: {
        '.bbtheme': 'text',
        '.png': 'dataurl'
    },
    plugins: [
        conditionalImportPlugin(2, {
            filter: /native_apis/,
            file: isApp ? 'native_apis.ts' : 'native_apis_web.ts'
        }),
        conditionalImportPlugin(3, {
            filter: /vue.js/,
            file: dev_mode ? 'vue.js' : 'vue.min.js',
            library: true,
        }),
        conditionalImportPlugin(1, {
            filter: /desktop/,
            file: 'desktop.js'
        }),
        createJsonPlugin('.bbkeymap', 'bbkeymap'),
        createVueSfcPlugin(),
        glsl({
            minify
        })
    ],
    sourcemap: true,
}

if (options.watch || options.serve) {
    let ctx = await esbuild.context(config);
    if (isApp) {
        await ctx.watch({});
    } else {
        await ctx.serve({
            servedir: import.meta.dirname,
            host: options.host,
            port: options.port
        });
    }
} else {
    if (options.analyze) config.metafile = true;
    let result = await esbuild.build(config);
    if (options.analyze) {
        writeFileSync('./dist/esbuild-metafile.json', JSON.stringify(result.metafile))
    }
}
