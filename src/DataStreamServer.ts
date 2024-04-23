// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import http from 'http';
import express, { Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { IMessage } from './types/IMessage.js';

class DataStreamServer {
    private app: express.Application;
    private server: http.Server;
    private io: SocketIOServer;
    private port: number;

    constructor(port: number = 3000) {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new SocketIOServer(this.server);
        this.port = port;

        this.configureRoutes();
        this.handleSocketConnections();
    }

    private configureRoutes(): void {
        this.app.get('/reset', (req: Request, res: Response) => {
            console.log(req);
            res.send('Reset');
        });

        this.app.get('*', (req: Request, res: Response) => {
            res.send('Hello World');
        });
    }

    private handleSocketConnections(): void {
        this.io.on('connection', (socket) => {
            console.log('A client has connected', socket.id);
        });
    }

    public sendData(message: IMessage): void {
        this.io.emit('message', JSON.stringify({ message }));
    }

    public start(): void {
        this.server.listen(this.port, () => {
            console.log(`DataStreamServer is running on port ${this.port}`);
        });
    }
}

export default DataStreamServer;
