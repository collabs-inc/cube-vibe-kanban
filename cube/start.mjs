import { ProcessGroup } from './processes.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
if (!['linux', 'darwin'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) throw new Error('Unsupported Vibe Kanban platform.');
const home = os.homedir();
const target = `${process.platform === 'darwin' ? 'macos' : 'linux'}-${process.arch}`;
const binary = path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'cube-vibe-kanban', `v0.1.44-20260424091429-${target}`, 'vibe-kanban');
const data = process.env.CUBE_VIBE_DATA_DIR || path.join(process.env.XDG_DATA_HOME || path.join(home, '.local/share'), 'cube-vibe-kanban');
// directories-rs uses XDG_DATA_HOME on Linux and the normal application directory on macOS.
const appData = process.platform === 'linux' ? path.join(data, 'vibe-kanban') : path.join(home, 'Library/Application Support/ai.bloop.vibe-kanban');
await mkdir(appData, { recursive: true, mode: 0o700 });
await mkdir(path.join(data, 'workspaces'), { recursive: true, mode: 0o700 });
const initialConfig = {
  config_version: 'v8', theme: 'SYSTEM', executor_profile: { executor: 'CLAUDE_CODE' },
  disclaimer_acknowledged: false, onboarding_acknowledged: false,
  remote_onboarding_acknowledged: false,
  notifications: { sound_enabled: false, push_enabled: false, sound_file: 'COW_MOOING' },
  editor: { editor_type: 'VS_CODE' }, github: { default_pr_base: 'main' },
  analytics_enabled: false, relay_enabled: false,
  workspace_dir: path.join(data, 'workspaces'), last_app_version: null, show_release_notes: false,
};
// Create once. Settings changed in Vibe Kanban remain untouched across app restarts/updates.
try {
  await writeFile(path.join(appData, 'config.json'), `${JSON.stringify(initialConfig, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
const env = {
  ...process.env, HOST: '127.0.0.1', PORT: String(port), BACKEND_PORT: String(port),
  PREVIEW_PROXY_PORT: '0', XDG_DATA_HOME: data,
  // Upstream orphan cleanup also scans a shared /var/tmp path used by other installs.
  DISABLE_WORKTREE_CLEANUP: '1',
  PATH: `${path.join(home, '.local/bin')}:${process.env.PATH || ''}`,
  // Same-origin validation uses the original Host supplied by Cube's gate.
  VK_ALLOWED_ORIGINS: '',
};
delete env.VK_TUNNEL;
const group = new ProcessGroup();
let stopping;
async function stop(code) {
  if (stopping) return stopping;
  stopping = group.stop().then(() => process.exit(code));
  return stopping;
}
group.onUnexpectedExit = error => { console.error(error.message); void stop(1); };
for (const signal of ['SIGHUP', 'SIGTERM', 'SIGINT']) process.on(signal, () => void stop(0));
group.spawn(binary, [], { cwd: data, env, stdio: 'inherit' });
