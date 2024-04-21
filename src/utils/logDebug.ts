// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import c from "chalk";
import fws from "fixed-width-string";

/**
 * Outputs debug information to the console with formatted chainId and log message.
 * Debugging must be enabled through the environment variable `DEBUG` set to 'true'.
 * 
 * @param chainId The ID of the chain for which the log is relevant.
 * @param log The debug message to log.
 */
export const logDebug = (chainId: number, log: string) => {
    if (process.env.DEBUG !== 'true') return;

    process.stdout.write(fws(c.gray('DEBUG'), 20));
    process.stdout.write(fws(c.blue(chainId.toString()), 10) + " ");
    process.stdout.write(fws('', 11));
    process.stdout.write(log);
    process.stdout.write("\n");
};
