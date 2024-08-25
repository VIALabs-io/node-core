import http from 'http';
import express, { Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { IMessage } from './types/IMessage.js';

class DataStreamServer {
    private app: express.Application;
    private server: http.Server;
    private io: SocketIOServer;
    private port: number;
    private filters: Partial<IMessage>;

    constructor(port: number = 3000, filters: Partial<IMessage> = {}) {
        this.app = express();
        this.server = http.createServer(this.app);
        this.port = port;
        this.filters = filters;

        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                allowedHeaders: ["*"],
                credentials: true
            }
        });

        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            next();
        });

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

    public setFilters(filters: Partial<IMessage>): void {
        this.filters = filters;
    }

    private applyFilters(message: IMessage): boolean {
        if (Object.keys(this.filters).length === 0) {
            return true;
        }

        for (const key in this.filters) {
            if (this.filters.hasOwnProperty(key)) {
                const filterValue = this.filters[key as keyof IMessage];
                const messageValue = message[key as keyof IMessage];

                // Handle nested values object filtering
                if (key === "values" && typeof filterValue === "object" && filterValue !== null) {
                    const valuesFilter = filterValue as Partial<IMessage["values"]>;
                    for (const subKey in valuesFilter) {
                        if (valuesFilter.hasOwnProperty(subKey)) {
                            const subKeyTyped = subKey as keyof IMessage["values"];
                            if (valuesFilter[subKeyTyped] !== message.values?.[subKeyTyped]) {
                                return false;
                            }
                        }
                    }
                } else if (filterValue !== messageValue) {
                    return false;
                }
            }
        }
        return true;
    }

    public sendData(message: IMessage): void {
        if (this.applyFilters(message)) {
            this.io.emit('message', JSON.stringify({ message }));
        }
    }

    public sendDataRaw(data: any): void {
        this.io.emit('message', JSON.stringify({ data }));
    }

    public start(): void {
        this.server.listen(this.port, () => {
            console.log(`DataStreamServer is running on port ${this.port}`);
        });
    }
}

export default DataStreamServer;
