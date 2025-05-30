import home from './home.ts';
import docs from './docs.ts';
import register from './register.ts';
import confirm from './confirm.ts';
import reconfirm from './reconfirm.ts';
import profile from './profile.ts';
import lost_password from './lost_password.ts';
import reset_password from "./reset_password.ts";
import { Application } from 'express';

export default (app: Application): void => {
    home(app);
    docs(app);
    register(app);
    confirm(app);
    reconfirm(app);
    profile(app);
    lost_password(app);
    reset_password(app);
};
