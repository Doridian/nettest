import { createServer } from 'http';
import { config } from './config';
import { networks, hostname } from './networks';
import { InfoCallback } from './types';

const srv = createServer((req, res) => {
    switch (req.url) {
        case '/ip':
            res.setHeader('Content-Type', 'text/plain');
            res.write(req.socket.remoteAddress);
            break;
        case '/info':
            res.setHeader('Content-Type', 'application/json');
            res.write(JSON.stringify({
                networks,
                hostname,
            } as InfoCallback));
            break;
        default:
            res.setHeader('Content-Type', 'text/plain');
            res.statusCode = 404;
            res.write('404 - Not Found');
            break;
        }
        res.end();
    });

const port = config.listenport;
srv.listen(port);
console.log(`Listening on ${port}`);
