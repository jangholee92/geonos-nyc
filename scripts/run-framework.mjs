import {fileURLToPath} from 'node:url';
import {projectRoot} from './runtime-env.mjs';
import {configureLocalTlsTrust} from './local-tls-trust.mjs';
const [command,...args]=process.argv.slice(2);
if(command!=='dev'&&command!=='build')throw Error('Expected dev or build.');
if(command==='dev')configureLocalTlsTrust(projectRoot);
const cli=new URL('../node_modules/vinext/dist/cli.js',import.meta.url);
process.argv=[process.execPath,fileURLToPath(cli),command,...(command==='dev'?['--port','5173']:[]),...args];
await import(cli.href);
