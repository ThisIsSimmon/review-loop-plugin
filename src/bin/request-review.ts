import { main } from '../commands/request-review';
import { runMain } from '../lib/util';

await runMain(() => main(process.argv.slice(2)));
