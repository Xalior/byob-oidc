declare module '@dr.pogodin/csurf' {
  import { RequestHandler } from 'express';
  
  interface CsurfOptions {
    cookie?: boolean | object;
    ignoreMethods?: string[];
    sessionKey?: string;
    value?: (req: any) => string;
  }
  
  function csurf(options?: CsurfOptions): RequestHandler;
  
  export = csurf;
}