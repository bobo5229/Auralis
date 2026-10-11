import electron from 'electron';
import { spawn } from 'node:child_process';
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['output/now-playing-icons-validation/capture.cjs'], { env, windowsHide: true, stdio: 'inherit' });
const timer = setTimeout(() => child.kill(), 25000);
const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timer); process.exit(code ?? 1);
