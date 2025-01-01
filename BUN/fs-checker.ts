import path from 'path';

export interface FileSystemItem {
	type: 'appFile';
	itemPath: string;
}

export interface AppRoute {
	pathname: string;
	page: string;
}

export interface FSChecker {
	getAppRoutes: () => Array<AppRoute>;
	getItem: (pathname: string) => Promise<FileSystemItem | null>;
}

export function createFsChecker({
	appDir,
	readFile,
	extensions = ['.js', '.jsx', '.ts', '.tsx'],
}: {
	appDir: string;
	readFile: (path: string) => Promise<ArrayBuffer>;
	extensions?: string[];
}): FSChecker {
	const appPathCache = new Map<string, FileSystemItem>();
	const routeCache = new Map<string, AppRoute>();

	function normalizePath(filePath: string): string {
		return filePath
			.replace(/(\/index)?\..*$/, '')
			.replace(/^\/+/, '')
			.replace(/\/+$/, '');
	}

	function resolveAppRoute(filePath: string): AppRoute {
		const pathname = '/' + normalizePath(path.relative(appDir, filePath));
		return {
			pathname,
			page: pathname,
		};
	}

	async function findAppFile(pathname: string): Promise<FileSystemItem | null> {
		// Remove trailing slash for lookup
		if (pathname.endsWith('/')) {
			pathname = pathname.slice(0, -1);
		}

		if (appPathCache.has(pathname)) {
			return appPathCache.get(pathname)!;
		}

		// Try all possible file extensions and layouts
		const possibleFiles = extensions.flatMap(ext => [
			path.join(appDir, pathname === '/' ? '' : pathname.slice(1), `page${ext}`),
			path.join(appDir, pathname === '/' ? '' : pathname.slice(1), `route${ext}`),
			path.join(appDir, `${pathname.slice(1)}${ext}`),
		]);

		for (const filePath of possibleFiles) {
			try {
				await readFile(filePath);
				const item = {
					type: 'appFile' as const,
					itemPath: filePath,
				};
				appPathCache.set(pathname, item);
				return item;
			} catch {
				continue;
			}
		}

		return null;
	}

	async function scanAppDirectory(): Promise<void> {
		const allFiles = await Array.fromAsync(
			new Bun.Glob('**/*.{js,jsx,ts,tsx}').scan({
				cwd: appDir,
				// ignore: ["node_modules/**", ".next/**"], // TODO: Can we support this in Bun.Glob API?
			}),
		);

		const files = allFiles.filter(
			file => !file.includes('node_modules') && !file.includes('.next'),
		);

		for (const file of files) {
			if (file.endsWith('.d.ts')) continue;

			if (
				file.endsWith('page.js') ||
				file.endsWith('page.jsx') ||
				file.endsWith('page.ts') ||
				file.endsWith('page.tsx') ||
				file.endsWith('route.js') ||
				file.endsWith('route.jsx') ||
				file.endsWith('route.ts') ||
				file.endsWith('route.tsx')
			) {
				const route = resolveAppRoute(file);
				routeCache.set(route.pathname, route);
			}
		}
	}

	let scanned = false;

	return {
		async getItem(pathname: string): Promise<FileSystemItem | null> {
			return findAppFile(pathname);
		},

		getAppRoutes(): Array<AppRoute> {
			if (!scanned) {
				scanAppDirectory();
				scanned = true;
			}
			return Array.from(routeCache.values());
		},
	};
}
