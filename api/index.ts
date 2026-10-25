/** HCM Lite REST API deployed as a single Vercel Node Function. */
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { serverDb } from '../src/server/db';
import { createApiRouter } from '../src/server/routes';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Cache-Control','no-store');
  next();
});
// When Vercel rewrites /api/v1/* to /api/index, the original path is
// forwarded explicitly as `route` to be unambiguous across runtimes.
app.use((req, _res, next) => {
  const route = req.query?.route;
  if (typeof route === 'string') {
    const cleanPath = route.split('?')[0].replace(/^\/+/, '');
    req.url = `/api/v1/${cleanPath}`;
  }
  next();
});
const origin = process.env.APP_URL;
app.use(cors({origin: origin ? [origin, 'http://localhost:3000'] : false}));
app.use(express.json({limit:'512kb'}));
app.use(express.urlencoded({extended:false,limit:'512kb'}));
// Lazy once-only, concurrency-safe initialization is inside serverDb.init().
app.use(async (_req, _res, next) => {try {await serverDb.init(); next();}catch(e){next(e);}});
app.get('/api/v1/health', (_req,res)=>res.status(200).json({status:'ok',service:'hcm-lite'}));
app.use('/api/v1',createApiRouter(serverDb));
app.use('/api/v1',(_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Unknown API endpoint.'}}));
app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{
  console.error('[HCM Lite API]',err?.message||err);
  const tooLarge = err?.type==='entity.too.large';
  const invalidJson = err instanceof SyntaxError && 'body' in err;
  const status = tooLarge?413:invalidJson?400:500;
  res.status(status).json({error:{code:tooLarge?'PAYLOAD_TOO_LARGE':invalidJson?'INVALID_JSON':'SERVER_ERROR',message:status===500?'Internal server error. Check function logs.':err?.message}});
});
export default app;
