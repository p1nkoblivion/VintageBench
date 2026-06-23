import { app, PathModule, SystemInfo } from '../native_apis';

export const VINTAGE_BENCH_APPDATA_FOLDER = 'Vintagebench';
export const VINTAGE_BENCH_EXPORTS_FOLDER = 'ModExports';

export function getDefaultVintageBenchAppDataPath() {
	if (!isApp) return '';
	return PathModule.join(SystemInfo.appdata_directory || app.getPath('appData'), VINTAGE_BENCH_APPDATA_FOLDER);
}

export function getDefaultVintageBenchModExportsPath() {
	if (!isApp) return '';
	return PathModule.join(getDefaultVintageBenchAppDataPath(), VINTAGE_BENCH_EXPORTS_FOLDER);
}
