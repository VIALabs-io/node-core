// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { CommandInteraction } from 'discord.js';

/**
 * Defines the structure for Discord commands within the application.
 */
interface IDiscordCommand {
    data: {
        name: string;                    // Name of the command
        description: string;             // Description of the command's functionality
        options?: any[];                 // Optional array of command options
    };
    /**
     * Function to execute the command.
     * @param vladiator - An instance of the main application class.
     * @param interaction - The command interaction object from discord.js.
     */
    execute: (vladiator: any, interaction: CommandInteraction) => void;
}

export { IDiscordCommand }
