/** review-loop が使う読み書きだけを持つ（Bun.file / Bun.write） */

export const isNotFoundError = (error: unknown): boolean =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** ファイルの本文。無ければ null（それ以外の失敗はそのまま投げる） */
export const readTextIfExists = async (path: string): Promise<string | null> => {
	try {
		return await Bun.file(path).text();
	} catch (error) {
		if (isNotFoundError(error)) return null;
		throw error;
	}
};

/** 親ディレクトリが無ければ Bun.write が作る */
export const writeText = async (path: string, text: string): Promise<void> => {
	await Bun.write(path, text);
};

export const writeJson = (path: string, data: unknown): Promise<void> =>
	writeText(path, `${JSON.stringify(data, null, '\t')}\n`);
