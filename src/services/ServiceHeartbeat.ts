import { IMessage } from "../types/IMessage.js";

export class ServiceHeartbeat {
    private nodePublicKey: string;
    private sendMessage: (message: IMessage) => Promise<void>;

    constructor(nodePublicKey: string, sendMessage: (message: IMessage) => Promise<void>) {
        this.nodePublicKey = nodePublicKey;
        this.sendMessage = sendMessage;
    }

    startHeartbeat(interval: number = 60000): void {
        setInterval(() => {
            this.sendHeartbeat();
        }, interval);
    }

    private async sendHeartbeat() {
        const status: string[] = [
            "Recursion: see Recursion.",
            "This line is gluten-free.",
            "Variable but not moody.",
            "Schrodinger's bug detected.",
            "Commit denied: too punny.",
            "I told you so, signed: Compiler.",
            "Array starts at 0.5 for optimism.",
            "Coders' mantra: It works, but don't touch it.",
            "Stack Overflow is my rubber duck.",
            "In case of fire: git commit, git push, exit building.",
            "Programmer's diet: coffee, cookies, and (clear)cache.",
            "404: Programmer not found.",
            "I've got a joke on UDP, but you might not get it.",
            "An SQL query walks into a bar, joins two tables and leaves.",
            "I would tell an IPv4 joke, but the good ones are all taken.",
            "My software never has bugs, it just develops random features.",
            "Why do programmers prefer dark mode? Because light attracts bugs.",
            "I don't see women as objects. I consider each to be in a class of her own.",
            "A programmer's wife tells him: 'Buy a loaf of bread. If they have eggs, buy a dozen.' He came back with 12 loaves.",
            "To understand what recursion is, you must first understand recursion.",
            "You had me at 'Hello World.'",
            "Machine learning in a nutshell: if it works, it's AI; if not, it's ML.",
            "2B OR NOT 2B? - That's FF.",
            "Why did the programmer quit his job? Because he didn't get arrays.",
            "Old programmers never die. They just decompile.",
            "I've got a really good UDP joke to tell you but I don't know if you'll get it.",
            "A byte walks into a bar looking for a bit.",
            "I'd tell you a concurrency joke, but it might take too long to get it.",
            "I love pressing F5. It's so refreshing.",
            "Why do programmers hate nature? It has too many bugs.",
            "Why do programmers like UNIX? It gives them more 'grep'.",
            "A SQL statement walks into a bar and sees two tables. It approaches and asks, 'Mind if I join you?'",
            "When your hammer is C++, everything begins to look like a thumb.",
            "A programmer had a problem. He thought to himself, 'I know, I'll solve it with threads!' has Now problems. two he",
            "Keyboard not responding. Press any key to continue.",
            "How does a programmer open a jar for his girlfriend? He installs Java.",
            "How many programmers does it take to change a light bulb? None, that's a hardware issue.",
            "Why was the JavaScript developer sad? Because he didn't Node how to Express himself.",
            "There is a band called 1023MB. They haven't had any gigs yet.",
            "Why do Java developers wear glasses? Because they don't C#.",
            "What's the object-oriented way to become wealthy? Inheritance.",
            "Why did the developer go broke? Because he used up all his cache.",
            "How do you comfort a JavaScript bug? You console it.",
            "A UDP packet walks into a bar, the bartender doesn't acknowledge him.",
            "I'd tell you a joke about git, but the punchline is too long to merge.",
            "Why don't bachelors like Git? Because they are afraid to commit.",
            "A user interface is like a joke. If you have to explain it, it's not that good.",
            "What's a programmer's favorite hangout place? Foo Bar.",
            "Algorithm: a word used by programmers when they do not want to explain what they did.",
            "Software and cathedrals are much the same - first we build them, then we pray.",
            "There's no place like 127.0.0.1.",
            "How many programmers does it take to kill a cockroach? Two: one holds, the other installs Windows on it.",
            "Programming is like sex: One mistake and you have to support it for the rest of your life.",
            "Why do programmers prefer using dark mode? Because light attracts bugs.",
            "Debugging: Being the detective in a crime movie where you are also the murderer.",
            "Code never lies, comments sometimes do.",
            "Why do programmers always mix up Christmas and Halloween? Because Oct 31 == Dec 25.",
            "What's the best thing about Boolean logic? Even if you're wrong, you're only off by a bit.",
            "A good programmer is someone who looks both ways before crossing a one-way street.",
            "Front-end developers do it with <style>.",
            "Why was the function a bad friend? It always left without saying goodbye.",
            "If debugging is the process of removing bugs, then programming must be the process of putting them in.",
            "Why did the programmer leave the restaurant? Because the pizza delivery API wasn't RESTful.",
            "How do you check if a webpage is HTML5? Try it out on Internet Explorer.",
            "Why did the blockchain developer go broke? Too many forks in his code.",
            "What's a blockchain developer's favorite dance? The block chain.",
            "Why don't blockchain developers like nature? Because they can't fork trees.",
            "What do you call a blockchain developer's favorite drink? Proof of Steak.",
            "Why did the smart contract feel safe? It was immutable to danger.",
            "What's a blockchain developer's favorite game? Hash tag.",
            "Why did the miner cross the road? To verify the chicken's transaction.",
            "What do you call a blockchain that's always complaining? A whine chain.",
            "Why did the NFT go to therapy? It had too many identity issues.",
            "What's a blockchain's favorite music? Block and roll.",
            "Why did the validator feel lonely? Nobody would stake with them."
        ];
                
        const index = Math.floor(Math.random() * status.length);
        this.sendMessage({
            type: 'HEARTBEAT',
            source: 1010101010,
            author: this.nodePublicKey,
            transactionHash: status[index]
        });
    }
}
