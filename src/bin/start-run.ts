import { main } from '../commands/start-run';
import { runMain } from '../lib/util';

await runMain(() => main(process.argv.slice(2)));
