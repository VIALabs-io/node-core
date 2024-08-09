// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import c from "chalk";
import fws from "fixed-width-string";
import { IMessage } from "../types/IMessage.js";

/**
 * Logs the traffic of messages with details about the message type, source, chain, and author.
 * It uses colors to differentiate between types of messages and to improve readability.
 * 
 * @param log The message object that contains information about the message being logged.
 */
export const logTraffic = (log: IMessage) => {
    try {
        switch(log.type) {
            case 'MESSAGE:REQUEST':
                process.stdout.write(fws(c.yellow('MESSAGE:REQUEST'), 20));
                break;
            case 'MESSAGE:SIGNED':
                process.stdout.write(fws(c.green('MESSAGE:SIGNED'), 20));
                break;
            case 'MESSAGE:EXECUTION':
                process.stdout.write(fws(c.redBright('MESSAGE:EXECUTION'), 20));
                break;
            case 'MESSAGE:QUEUED':
                process.stdout.write(fws(c.cyan('MESSAGE:QUEUED'), 20));
                break;
            case 'MESSAGE:INVALID':
                process.stdout.write(fws(c.bgRed('MESSAGE:INVALID'), 20));
                break;                
            case 'MESSAGE:EXISTS':
                process.stdout.write(fws(c.gray('MESSAGE:EXISTS'), 20));
                break;
            case 'PENALTY:CHAINMISS':
                process.stdout.write(fws(c.bgRed('PENALTY:CHAINMISS'), 20));
                break;
            case 'HEARTBEAT':
                process.stdout.write(fws(c.gray('HEARTBEAT:KEEPALIVE'), 20));
                break;
            default:
                process.stdout.write(fws(c.red('*' + log.type), 20));
                break;
        }
        
        process.stdout.write(fws(c.blue(log.source), 10) + " ");
        if(!log.values) {
            process.stdout.write(fws('', 11));
        } else {
            process.stdout.write(fws(c.blue('-> ' + log.values!.chain), 10) + " ");
        }

        process.stdout.write(fws(log.author, 8) + " ");
        process.stdout.write(log.transactionHash + " ");
        if(log.executionHash) {
            process.stdout.write(log.executionHash + " ");
        }
        process.stdout.write("\n");  
    } catch(e:any) {
        console.log(e);
        console.log(log);
    }
};