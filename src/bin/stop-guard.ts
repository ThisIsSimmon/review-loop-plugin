import { main } from '../commands/stop-guard';
import { errorMessage } from '../lib/util';

// フックの不具合でセッションを縛らないよう、失敗しても終了コード 0 で終える
try {
	await main();
} catch (error) {
	console.error(`stop-guard: ${errorMessage(error)}`);
}
