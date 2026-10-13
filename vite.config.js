import {defineConfig} from 'vite';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {localGeminiMiddleware} from './server/local-gemini.js';

export default defineConfig(({command}) => {
  const envFile = fileURLToPath(new URL('./.env',import.meta.url));
  if (command === 'serve' && existsSync(envFile)) process.loadEnvFile(envFile);
  const apiKey = command === 'serve' ? process.env.GEMINI_API_KEY?.trim() : null;
  return {
    define:{__LOCAL_GEMINI_AVAILABLE__:JSON.stringify(Boolean(apiKey))},
    server:{host:'127.0.0.1',port:5173,strictPort:true,
      fs:{deny:['**/.env','**/.env.*','**/*.{crt,pem}','**/.git/**']}},
    plugins:[{name:'private-local-gemini',apply:'serve',configureServer(server) {
      server.middlewares.use(localGeminiMiddleware({apiKey}));
    }}]
  };
});
