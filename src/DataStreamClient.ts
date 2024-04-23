// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { io, Socket } from "socket.io-client";
import { IMessage } from "./types/IMessage.js";

export class DataStreamClient {
    private socket: Socket;
    private url: string;

    constructor(url: string = "http://localhost:3000") {
        this.url = url;
        this.socket = io(this.url);
    }

    public connect(onMessage: (message: IMessage) => void, onConnect?: () => void, onDisconnect?: () => void): void {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            onConnect?.();
        });

        this.socket.on('message', (data: string) => {
            try {
                const message: IMessage = JSON.parse(data);
                onMessage(message);
            } catch (error) {
                console.error('Failed to parse message:', error);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            onDisconnect?.();
        });
    }

    public sendMessage(message: IMessage): void {
        this.socket.emit('message', JSON.stringify(message));
    }

    public disconnect(): void {
        this.socket.disconnect();
    }
}
