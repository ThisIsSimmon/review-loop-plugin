import { main } from '../commands/cleanup-run-files';
import { runMain } from '../lib/util';

await runMain(() => main(process.argv.slice(2)));
