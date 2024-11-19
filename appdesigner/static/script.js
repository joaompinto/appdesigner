import { agentAPI } from './agents.js';

export function refreshMainFrame() {
    const iframe = document.getElementById('main-iframe');
    if (iframe) {
        // Show simple refresh message
        $('<div>')
            .addClass('terminal-line system-message')
            .text('↻ Refreshing preview...')
            .insertBefore('#terminal-input');
        
        // Add a delay before refreshing
        setTimeout(() => {
            const currentSrc = iframe.src.split('?')[0];
            iframe.src = `${currentSrc}?t=${Date.now()}`;
        }, 1000);
    }
}

function updateIframePort(port) {
    const iframe = document.getElementById('main-iframe');
    if (iframe) {
        iframe.src = `http://localhost:${port}`;
        iframe.dataset.port = port;
    }
}

export function handleKeyPress(event) {
    if (event.key === 'Enter') {
        const $input = $('#terminal-input');
        const command = $input.val();
        
        if (!command) return;
        
        // Create command line
        $('<div>')
            .addClass('terminal-line command-line')
            .text(command)
            .insertBefore($input);
        
        // Use agentAPI instead of direct fetch
        agentAPI.processUserInstructions(command)
            .then(response => {
                const $wrapper = $('<div>').addClass('response-line-wrapper');
                
                   
                // Add response text
                $wrapper.append(
                    $('<div>')
                        .addClass('terminal-line response-line')
                        .text(response.response)
                );
                
                $wrapper.insertBefore($input);
                
                // Auto-scroll and refresh
                scrollToBottom();
                refreshMainFrame();
            })
            .catch(error => {
                $('<div>')
                    .addClass('terminal-line response-line error')
                    .text(`Error: ${error.message}`)
                    .insertBefore($input);
            });
        
        // Clear input
        $input.val('');
    }
}

function scrollToBottom() {
    const $terminalOutput = $('.terminal-output');
    if ($terminalOutput.length) {
        $terminalOutput.animate({ 
            scrollTop: $terminalOutput[0].scrollHeight 
        }, 200);
    }
}

$(document).ready(() => {
    // Get port from URL params or use default
    const urlParams = new URLSearchParams(window.location.search);
    const port = urlParams.get('managed_port') || '8000';
    updateIframePort(port);
    
    // Add event listener for terminal input
    document.getElementById('terminal-input').addEventListener('keypress', handleKeyPress);
    
    // Start log updates immediately and then every second
    updateLogs();
    setInterval(updateLogs, 1000);
    
    // Add modal close handlers
    $('.modal-close').on('click', function() {
        $(this).closest('.modal').hide();
    });
    
    $(window).on('click', function(event) {
        if ($(event.target).hasClass('modal')) {
            $('.modal').hide();
        }
    });
    
    // Add logs section collapse functionality
    $('.logs-section h2').on('click', function() {
        $(this).parent('.logs-section').toggleClass('collapsed');
    });
    
    // Initialize logs section as collapsed
    $('.logs-section').addClass('collapsed');
});

// Move updateLogs function here to avoid duplication
async function updateLogs() {
    try {
        const data = await agentAPI.getLogs();
        const $logs = $('#server-logs');
        
        // Only update if we have new content
        if (data.logs && data.logs !== $logs.data('lastContent')) {
            $logs.empty();
            
            // Split and add each log line
            data.logs.split('\n').forEach(line => {
                if (line.trim()) {
                    $('<div>')
                        .addClass('log-line')
                        .text(line)
                        .appendTo($logs);
                }
            });
            
            // Store current content and handle scrolling
            $logs.data('lastContent', data.logs);
            
            // Auto-scroll if near bottom
            const isNearBottom = $logs[0].scrollHeight - $logs.scrollTop() <= $logs.height() + 100;
            if (isNearBottom) {
                $logs.scrollTop($logs[0].scrollHeight);
            }
        }
    } catch (error) {
        console.error('Failed to update logs:', error);
    }
}