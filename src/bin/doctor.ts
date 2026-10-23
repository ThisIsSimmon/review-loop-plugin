import { main } from '../commands/doctor';
import { runMain } from '../lib/util';

await runMain(() => main(process.argv.slice(2)));
