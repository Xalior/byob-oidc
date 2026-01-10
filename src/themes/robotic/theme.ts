const single_render = (html: string)  => {
    return `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
                <meta http-equiv="x-ua-compatible" content="ie=edge">
                <title>Robotic SSO Server</title>
                <link rel="stylesheet" href="/theme/main.css">
            </head>
            <body>
                <div class="container">
                    ${html}
                </div>
                <script src="/theme/main.js"></script>            
            </body>
        </html>`;
}

export default {
    name: 'robotic',
    page: (html: string)  => single_render(html),
    logout: (form: string, hostname: string)  => {
        return single_render(`<h1>System Sign-out Request: ${hostname}</h1>
                    <p>Confirm termination of session across the network?</p>
                    ${form}
                    <button autofocus type="submit" form="op.logoutForm" value="yes" name="logout">TERMINATE SESSION</button>
                    <button type="submit" form="op.logoutForm">MAINTAIN SESSION</button>`);
    },
    loggedout: (html: string)  => {
        return single_render(`<h1>Session Terminated</h1>
                                <p>System status: Logged out ${html ? `from ${html}` : ''}.</p>`);
    },
    error: (html: string)  => single_render(html)
};
