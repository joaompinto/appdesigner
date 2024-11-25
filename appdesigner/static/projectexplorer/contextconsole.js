import { contextItems } from './context.js';

export function initializeContextConsole() {
    console.log('Initializing context console...');
    
    const consoleElement = document.querySelector('web-console');
    const consoleWrapper = document.querySelector('.context-console-wrapper');
    
    if (!consoleElement || !consoleWrapper) {
        console.warn('Web console elements not found in DOM');
        return;
    }

    // Initial setup
    consoleElement
        .setPromptSymbol('> ')
        .setPlaceholder('Type a command for the current context')
        .setTimestamps(false)
        .onCommand(handleCommand); // Add command handler

    // Command handler function
    async function handleCommand(command) {
        const cmd = command.trim();
        
        // Print user input with user message style first
        consoleElement.printMessage(`${consoleElement.promptSymbol}${cmd}`, 'message-user');
        
        if (!window.currentContext) {
            consoleElement.printMessage('No context selected', 'message-error');
            return;
        }

        // Use imported contextItems instead of window.contextItems
        const currentContext = contextItems[window.currentContext];
        if (!currentContext) {
            consoleElement.printMessage('Current context not found', 'message-error');
            return;
        }

        // Handle built-in dot commands
        if (cmd.startsWith('.')) {
            const dotCommand = cmd.substring(1).toLowerCase(); // Remove the dot and normalize
            switch (dotCommand) {
                case 'help':
                    consoleElement.printSystemMessage(
                        "Available commands:\n" +
                        "- `.help`: Show this help message\n" +
                        "- `.clear`: Clear console\n" +
                        "- `.list`: List files in current context\n" +
                        "- `.count`: Show number of files\n" +
                        "- `.info`: Show context information\n\n" +
                        "Any other input will be sent as an instruction to the agent API."
                    );
                    break;
                    
                case 'clear':
                    consoleElement.consoleElement.innerHTML = '';
                    break;
                    
                case 'list':
                    const items = Array.from(currentContext.items);
                    if (items.length === 0) {
                        consoleElement.printMessage('No files in context', 'message-system');
                    } else {
                        consoleElement.printSystemMessage(
                            "Files in context:\n" + 
                            items.map(f => `- \`${f}\``).join('\n')
                        );
                    }
                    break;
                    
                case 'count':
                    const count = currentContext.items.size;
                    consoleElement.printMessage(`${count} file${count !== 1 ? 's' : ''} in context`, 'message-system');
                    break;
                    
                case 'info':
                    consoleElement.printSystemMessage(`
Context Information:
- Name: \`${window.currentContext}\`
- Type: \`${currentContext.type}\`
- Color: \`${currentContext.color}\`
- Files: \`${currentContext.items.size}\`
                    `);
                    break;
                    
                default:
                    consoleElement.printMessage(`Unknown command: ${cmd}`, 'message-error');
                    consoleElement.printMessage('Type ".help" to see available commands', 'message-system');
            }
        } else {
            // Get all files including those in folders
            let allFiles = new Set();
            
            // Process each item in the context
            for (const item of currentContext.items) {
                if (currentContext.itemTypes?.get(item) === 'directory') {
                    // If it's a directory, fetch its contents
                    try {
                        const response = await fetch(`/api/files?path=${encodeURIComponent(item)}`);
                        if (response.ok) {
                            const files = await response.json();
                            files.forEach(file => {
                                if (file.type === 'file') {
                                    allFiles.add(file.path);
                                }
                            });
                        }
                    } catch (error) {
                        console.error('Error fetching directory contents:', error);
                    }
                } else {
                    // If it's a file, add it directly
                    allFiles.add(item);
                }
            }

            const files = Array.from(allFiles);
            
            // Print files that will be sent
            consoleElement.printMessage('Sending files to Claude:', 'message-system');
            files.forEach(file => {
                consoleElement.printMessage(`  - ${file}`, 'file-item');
            });

            // Handle API request
            try {
                const response = await fetch('/api/process-user-instructions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        instruction: cmd,
                        counter: Date.now(),
                        files: files
                    })
                });
                
                const result = await response.json();
                if (result.error) {
                    consoleElement.printMessage(`Error: ${result.error}`, 'message-error');
                } else {
                    consoleElement.printSystemMessage(result.response);
                }
            } catch (error) {
                consoleElement.printMessage(`Failed to process instruction: ${error}`, 'message-error');
            }
        }
    }
}