/**
 * plugins/review-loop/.claude-plugin/plugin.json と .claude-plugin/marketplace.json の version が同じことを確かめる。
 * どちらかだけ上げると、インストール済みの環境に更新が届かなかったり、表示と中身がずれたりする。
 */
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const pluginPath = join('plugins', 'review-loop', '.claude-plugin', 'plugin.json');
const marketplacePath = join('.claude-plugin', 'marketplace.json');

const plugin = await Bun.file(join(root, pluginPath)).json();
const marketplace = await Bun.file(join(root, marketplacePath)).json();

const pluginVersion: unknown = plugin.version;
const entry = marketplace.plugins?.find((p: { name?: string }) => p.name === plugin.name);
const marketplaceVersion: unknown = entry?.version;

if (typeof pluginVersion !== 'string' || typeof marketplaceVersion !== 'string') {
	console.error(`version が見つからない: ${pluginPath}=${pluginVersion}, ${marketplacePath}=${marketplaceVersion}`);
	process.exit(1);
}
if (pluginVersion !== marketplaceVersion) {
	console.error(`version がずれている: ${pluginPath}=${pluginVersion}, ${marketplacePath}=${marketplaceVersion}`);
	process.exit(1);
}
console.log(`version ${pluginVersion}`);
