import { main } from '../commands/finish-run';
import { runMain } from '../lib/util';

await runMain(() => main(process.argv.slice(2)));
