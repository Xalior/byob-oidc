import { Request, Response, Application } from 'express';

export default (app: Application): void => {
    app.get('/', async (req: Request, res: Response) => {

        if(req.user && req.session.destination_path) {
            const destinationPath = req.session.destination_path;
            delete(req.session.destination_path);
            return res.redirect(destinationPath);
        }
        return res.render('home');
    });
};