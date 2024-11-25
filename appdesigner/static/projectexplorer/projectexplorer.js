import { loadContextsFromAPI, initializeContextExplorer, initializeContextHandlers, switchContext, contextItems } from './context.js';
import { loadFileTree, initializeFileTree } from './filetree.js';
import { updateEditorMode, initializeEditorButtons } from './editor.js';
import { initializeContextConsole } from './contextconsole.js';
import '../lib/webconsole.js';  // Import web console component first

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize file tree and its handlers
    loadFileTree();
    initializeFileTree();

    // Load and initialize contexts
    await loadContextsFromAPI();
    initializeContextExplorer();
    initializeContextHandlers();

    // Switch to first context if available after loading
    const contexts = Object.keys(contextItems);
    if (contexts.length > 0) {
        switchContext(contexts[0]);
    }

    // Initialize editor in readonly mode and setup buttons
    updateEditorMode(true);
    initializeEditorButtons();

    // Initialize context console
    initializeContextConsole();
});