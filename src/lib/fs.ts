/** Node 標準の fs で、review-loop が使う読み書きだけを持つ（Bun.file / Bun.write の置き換え） */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const isNotFoundError = (error: unknown): boolean =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** ファイルの本文。無ければ null（それ以外の失敗はそのまま投げる） */
export const readTextIfExists = async (path: string): Promise<string | null> => {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if (isNotFoundError(error)) return null;
		throw error;
	}
};

/** 親ディレクトリを作ってから書く */
export const writeText = async (path: string, text: string): Promise<void> => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, text, 'utf8');
};

export const writeJson = (path: string, data: unknown): Promise<void> =>
	writeText(path, `${JSON.stringify(data, null, '\t')}\n`);
