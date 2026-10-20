import { main } from '../commands/record-dispositions';
import { runMain } from '../lib/util';

await runMain(() => main(process.argv.slice(2)));
