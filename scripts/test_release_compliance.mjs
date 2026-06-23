import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function exists(relPath) {
	return fs.existsSync(path.join(root, relPath));
}

function read(relPath) {
	return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function compact(text) {
	return text.replace(/\s+/g, ' ');
}

function walk(relDir) {
	const absDir = path.join(root, relDir);
	if (!fs.existsSync(absDir)) return [];
	return fs.readdirSync(absDir, {withFileTypes: true}).flatMap(entry => {
		const child = path.join(relDir, entry.name).replace(/\\/g, '/');
		return entry.isDirectory() ? walk(child) : [child];
	});
}

const packageJson = JSON.parse(read('package.json'));
const buildFiles = packageJson.build?.files || [];

const requiredPackageFiles = [
	'README.md',
	'LICENSE.MD',
	'NOTICE',
	'SOURCE_CODE.md',
	'THIRD_PARTY_NOTICES.md',
	'CHANGELOG.md',
];

assert.equal(exists('LICENSE.MD'), true, 'GPL-3.0 license text must be present');
assert.match(read('LICENSE.MD'), /GNU GENERAL PUBLIC LICENSE\s+Version 3/i);
assert.equal(packageJson.license, 'GPL-3.0-or-later');

const notice = read('NOTICE');
assert.match(notice, /Original project:\s*Blockbench/i);
assert.match(notice, /https:\/\/github\.com\/JannisX11\/blockbench/i);
assert.match(notice, /Original Blockbench copyright notices are retained/i);
assert.match(notice, /modified fork of Blockbench/i);
assert.match(notice, /Modified-work notice/i);
assert.match(notice, /2026-06-22/);
assert.match(compact(notice), /WITHOUT ANY WARRANTY/i);
assert.match(notice, /No additional EULA/i);
assert.match(notice, /does not bundle proprietary Vintage Story/i);
assert.match(notice, /user-created assets/i);

const readme = read('README.md');
assert.match(readme, /modified from Blockbench/i);
assert.match(readme, /Original Blockbench copyright notices are retained/i);
assert.match(readme, /Source code/i);
assert.match(readme, /User-Created Assets/i);
assert.match(readme, /Vintage Story Assets/i);
assert.match(readme, /Generated Declarations/i);
assert.match(readme, /npm run generate-types/);

const source = read('SOURCE_CODE.md');
assert.match(source, /https:\/\/github\.com\/p1nkoblivion\/VintageBench/);
assert.match(source, /release tag or commit reference/i);
assert.match(source, /types\/generated/i);
assert.match(source, /npm run generate-types/);
assert.equal(packageJson.scripts?.['generate-types']?.includes('tsc'), true);

const thirdPartyNotices = read('THIRD_PARTY_NOTICES.md');
assert.match(thirdPartyNotices, /Blockbench/i);
assert.match(thirdPartyNotices, /Vintage Story Assets/i);
assert.match(thirdPartyNotices, /does not bundle proprietary Vintage Story/i);

const about = read('js/interface/about.ts');
assert.match(about, /modified fork of Blockbench/i);
assert.match(about, /Original Blockbench copyright notices are retained/i);
assert.match(about, /2026-06-22/);
assert.match(about, /GNU General Public License version 3/i);
assert.match(about, /redistribute and modify/i);
assert.match(about, /ABSOLUTELY NO WARRANTY/i);
assert.match(about, /github\.com\/p1nkoblivion\/VintageBench/i);
assert.match(about, /No additional EULA/i);
assert.match(about, /User-created models/i);
assert.match(about, /No proprietary Vintage Story/i);

requiredPackageFiles.forEach(file => {
	assert.equal(buildFiles.includes(file), true, `${file} must be included in package build.files`);
});

['.resources/', 'types/generated/', 'EULA', 'EULA.md', 'EULA.txt'].forEach(file => {
	assert.equal(buildFiles.includes(file), false, `${file} must not be included in package build.files`);
});

assert.equal(exists('EULA'), false, 'Do not add an extra EULA');
assert.equal(exists('EULA.md'), false, 'Do not add an extra EULA');
assert.equal(exists('EULA.txt'), false, 'Do not add an extra EULA');

const gitignore = read('.gitignore');
assert.match(gitignore, /\/types\/generated\//);
assert.match(gitignore, /\.resources\//);

const forbiddenAssetPatterns = [
	/assets\/survival\//i,
	/assets\/game\//i,
	/assets\/creative\//i,
	/vintagestory/i,
	/seraph/i,
	/mannequin/i,
];

walk('assets').forEach(file => {
	forbiddenAssetPatterns.forEach(pattern => {
		assert.equal(pattern.test(file), false, `${file} looks like a bundled Vintage Story game asset`);
	});
});

console.log('Release compliance checks passed');
