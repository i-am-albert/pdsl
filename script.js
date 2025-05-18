document.addEventListener('DOMContentLoaded', () => {
    const inviteForm = document.getElementById('invite-form');
    const inviteLinkInput = document.getElementById('invite-link');
    const formMessage = document.getElementById('form-message');
    const serverListSection = document.getElementById('server-list');
    const sortBySelect = document.getElementById('sort-by');
    const exportJsonButton = document.getElementById('export-json');
    const exportCsvButton = document.getElementById('export-csv');
    const exportTxtButton = document.getElementById('export-txt');

    // Cloudflare Worker URL - replace with your actual worker URL
    const WORKER_URL = 'https://pdsl-worker.ytalberta.workers.dev'; // Example: https://pdsl-worker.yourusername.workers.dev

    let servers = []; // To store the server data locally

    // --- Form Submission ---
    inviteForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const invite = inviteLinkInput.value.trim();
        if (!invite) {
            displayMessage('Please enter an invite link or code.', 'error');
            return;
        }
        displayMessage('Submitting invite...', 'info');

        try {
            const response = await fetch(`${WORKER_URL}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteCode: extractInviteCode(invite) })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                displayMessage(result.message || 'Server submitted successfully! It will be reviewed and added.', 'success');
                inviteLinkInput.value = '';
                fetchServers(); // Refresh the list
            } else {
                displayMessage(result.error || 'Submission failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Submission error:', error);
            displayMessage('An error occurred during submission. Check console.', 'error');
        }
    });

    // --- Fetch and Display Servers ---
    async function fetchServers() {
        displayMessage('Fetching server list...', 'info');
        try {
            // In a pure static setup, we'd fetch a JSON file.
            // With a worker, the worker could also serve this, or we fetch directly from GitHub raw.
            const response = await fetch('https://raw.githubusercontent.com/i-am-albert/pdsl/main/data/servers.json'); // Replace with your repo details
            if (!response.ok) {
                if (response.status === 404) {
                     servers = []; // File doesn't exist yet, start with an empty list
                     displayMessage('Server list is currently empty. Submit a server to get started!', 'info');
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            } else {
                 servers = await response.json();
            }
            renderServers();
            displayMessage('Server list loaded.', 'success');
        } catch (error) {
            console.error('Error fetching servers:', error);
            servers = []; // Ensure servers is an array even on error
            renderServers(); // Render empty state or error
            displayMessage('Could not load server list. See console for details.', 'error');
        }
    }

    function renderServers() {
        serverListSection.innerHTML = ''; // Clear existing list

        if (!servers || servers.length === 0) {
            serverListSection.innerHTML = '<p>No servers listed yet. Be the first to submit one!</p>';
            return;
        }

        const sortedServers = sortServers(servers, sortBySelect.value);

        sortedServers.forEach(server => {
            const card = document.createElement('div');
            card.className = 'server-card';
            card.innerHTML = `
                <img src="${server.icon_url || 'https://via.placeholder.com/50'}" alt="${server.name} icon">
                <div class="server-info">
                    <h3>${server.name}</h3>
                    <p>Members: ${server.member_count_approximate} (Online: ${server.member_count_online})</p>
                    <p>Description: ${server.description || 'N/A'}</p>
                    <p>Added: ${new Date(server.added_timestamp).toLocaleDateString()}</p>
                    <a href="https://discord.gg/${server.invite_code}" target="_blank" rel="noopener noreferrer">Join Server</a>
                </div>
            `;
            serverListSection.appendChild(card);
        });
    }

    // --- Sorting ---
    sortBySelect.addEventListener('change', renderServers);

    function sortServers(serversToSort, criteria) {
        return [...serversToSort].sort((a, b) => {
            if (criteria === 'name') {
                return a.name.localeCompare(b.name);
            } else if (criteria === 'member_count') {
                return (b.member_count_approximate || 0) - (a.member_count_approximate || 0);
            } else if (criteria === 'added_date') {
                return new Date(b.added_timestamp) - new Date(a.added_timestamp);
            }
            return 0;
        });
    }

    // --- Exporting ---
    exportJsonButton.addEventListener('click', () => exportData(servers, 'json'));
    exportCsvButton.addEventListener('click', () => exportData(servers, 'csv'));
    exportTxtButton.addEventListener('click', () => exportData(servers, 'txt'));

    function exportData(data, format) {
        if (!data || data.length === 0) {
            displayMessage('No data to export.', 'info');
            return;
        }

        let content = '';
        let mimeType = '';
        let filename = `pdsl-servers.${format}`;

        if (format === 'json') {
            content = JSON.stringify(data, null, 2);
            mimeType = 'application/json';
        } else if (format === 'csv') {
            if (data.length > 0) {
                const headers = Object.keys(data[0]);
                content = headers.join(',') + '\n';
                data.forEach(server => {
                    content += headers.map(header => `"${(server[header] || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
                });
            }
            mimeType = 'text/csv';
        } else if (format === 'txt') {
            data.forEach(server => {
                content += `Server: ${server.name}\n`;
                content += `Invite Code: ${server.invite_code}\n`;
                content += `Members: ${server.member_count_approximate}\n`;
                content += `Added: ${new Date(server.added_timestamp).toLocaleDateString()}\n`;
                content += `Description: ${server.description || 'N/A'}\n`;
                content += `Icon URL: ${server.icon_url || 'N/A'}\n`;
                content += `-------------------------------------\n`;
            });
            mimeType = 'text/plain';
        }

        if (content) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            displayMessage(`Exported as ${filename}`, 'success');
        }
    }


    // --- Utility Functions ---
    function displayMessage(message, type = 'info') { // type can be 'info', 'success', 'error'
        formMessage.textContent = message;
        formMessage.className = type; // Make sure to style .info, .success, .error in CSS
        setTimeout(() => {
             // Keep important messages longer or until next action
            if (type === 'info' && message.startsWith('Fetching') || message.startsWith('Submitting')) {
                // Don't auto-clear loading messages
            } else {
                formMessage.textContent = '';
                formMessage.className = '';
            }
        }, type === 'error' ? 7000 : 4000);
    }

    function extractInviteCode(invite) {
        // Extracts code from URLs like:
        // https://discord.gg/code
        // discord.gg/code
        // discord.com/invite/code
        // code
        try {
            if (invite.includes('discord.gg/')) {
                return invite.split('discord.gg/')[1].split('/')[0];
            } else if (invite.includes('discord.com/invite/')) {
                return invite.split('discord.com/invite/')[1].split('/')[0];
            }
            // Basic check for a typical invite code pattern (alphanumeric, can be short)
            // This is not foolproof for *only* codes, but good enough for input flexibility
            if (/^[a-zA-Z0-9-]+$/.test(invite) && invite.length < 20) {
                 return invite;
            }
        } catch (e) {
            // if split fails, it's likely just the code
        }
        return invite; // Assume it's a code if no URL parts found
    }

    // --- Initial Load ---
    fetchServers();
});

// Add to style.css:
/*
.info { color: blue; }
.success { color: green; }
.error { color: red; }
*/ 