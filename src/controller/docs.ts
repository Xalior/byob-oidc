import { users, confirmation_codes } from "../db/schema.ts";
import { db } from "../db/index.ts";
import { eq, and, gte } from "drizzle-orm";
import { Request, Response, NextFunction, Application } from 'express';
import slugify from "slugify";

const allowedDocs = ['about'];
export default (app: Application): void => {


    app.get('/docs/:path',
        function(req: Request, res: Response, next: NextFunction) {
            try{
                // @ts-ignore - slugify does not need options, this is valid
                const path = slugify(req.params.path);
                if (!allowedDocs.includes(path)) return res.status(404).send("Not Found");
                return res.render(`docs/${path}`);
            } catch (err) {
                return res.status(404).send("Not Found");
            }
        }
    );
};