import { agentAPI } from './agents.js';

function refreshMainFrame() {
    const iframe = document.getElementById('main-iframe');
    if (iframe) {
        // Show refresh message with timestamp
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        $('<div>')
            .addClass('terminal-line system-message')
            .text(`↻ Refreshing preview... [${timestamp}]`)
            .insertBefore('#terminal-input');
        
        // Add a delay before refreshing
        setTimeout(() => {
            // Force reload by adding timestamp to URL
            const currentSrc = iframe.src.split('?')[0];
            iframe.src = `${currentSrc}?t=${Date.now()}`;
        }, 1000);
    }
}

function handleKeyPress(event) {
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
                
                // Add info icon first
                $wrapper.append(
                    $('<div>')
                        .addClass('info-icon')
                        .html('<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>')
                        .attr('title', 'View full response')
                        .on('click', () => showRawOutput(response.rawOutput))
                );
                
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

function showRawOutput(rawOutput) {
    const modal = document.getElementById('rawOutputModal');
    const modalContent = document.getElementById('rawModalContent');
    modalContent.textContent = rawOutput;
    modal.style.display = 'block';
}

$(document).ready(() => {
    // Update logs automatically
    function updateLogs() {
        $.get('/process-output', function(data) {
            const $logs = $('#server-logs');
            $logs.empty(); // Clear existing logs
            
            // Add the new logs
            const lines = data.split('\n');
            lines.forEach(line => {
                if (line.trim()) {  // Only add non-empty lines
                    // Check for directory update marker
                    if (line.includes('✓ Directory structure created at') || 
                        line.includes('✓ Changes applied to') ||
                        line.includes('Updated /tmp/appdesigner/')) {
                        refreshMainFrame();
                    }
                    
                    $('<div>')
                        .addClass('terminal-line')
                        .text(line)
                        .appendTo($logs);
                }
            });
            
            // Auto-scroll to bottom if near bottom
            const isNearBottom = $logs[0].scrollHeight - $logs.scrollTop() <= $logs.height() + 100;
            if (isNearBottom) {
                $logs.scrollTop($logs[0].scrollHeight);
            }
        });
    }

    // Start automatic log updates
    updateLogs();
    setInterval(updateLogs, 500);  // Update every 500ms instead of 1000ms

    // Remove old button handler
    $('.nav-button').remove();
    
    // Add modal close handlers
    $('.modal-close').on('click', function() {
        $(this).closest('.modal').hide();
    });
    
    $(window).on('click', function(event) {
        if ($(event.target).hasClass('modal')) {
            $('.modal').hide();
        }
    });
});