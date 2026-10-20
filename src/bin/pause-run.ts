import { main } from '../commands/pause-run';
import { runMain } from '../lib/util';

await runMain(() => main(process.argv.slice(2)));
