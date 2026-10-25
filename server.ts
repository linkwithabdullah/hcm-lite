/** Local development server. Vercel uses api/index.ts instead. */
import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { serverDb } from './src/server/db.js';
import app from './api/index.js';

async function main() {
  await serverDb.init();
  if (process.env.NODE_ENV !== 'production') {
    const {createServer} = await import('vite');
    const vite = await createServer({server:{middlewareMode:true},appType:'spa'});
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(process.cwd(),'dist');
    app.use(express.static(dist));
    app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
  }
  const port = Number(process.env.PORT || 3000);
  app.listen(port,'0.0.0.0',()=>console.log(`HCM Lite: http://localhost:${port}`));
}
main().catch(err=>{console.error('[HCM Lite] Startup error:',err);process.exitCode=1;});
