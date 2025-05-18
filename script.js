document.addEventListener('DOMContentLoaded', () => {
    const inviteForm = document.getElementById('invite-form');
    const inviteLinkInput = document.getElementById('invite-link');
    const formMessage = document.getElementById('form-message');
    // const serverListSection = document.getElementById('server-list'); // Old, replaced by table
    const serverTable = document.getElementById('server-table').getElementsByTagName('tbody')[0];
    const serverTableHeader = document.getElementById('server-table').getElementsByTagName('thead')[0];
    const noServersMessage = document.getElementById('no-servers-message');
    const columnVisibilityControls = document.getElementById('column-visibility-controls');

    const exportJsonButton = document.getElementById('export-json');
    const exportCsvButton = document.getElementById('export-csv');
    const exportTxtButton = document.getElementById('export-txt');

    const WORKER_URL = 'https://pdsl-worker.ytalberta.workers.dev';

    let servers = [];
    let currentSort = {
        key: 'name', // Default sort key
        direction: 'asc' // 'asc' or 'desc'
    };

    // Define all possible columns, their display names, default visibility, and how to render them
    // Based on fields from newServer object in worker/index.js
    const allColumns = {
        icon: { label: 'Icon', defaultVisible: true, render: (server) => `<img src="${server.icon_url || 'https://via.placeholder.com/50?text=N/A'}" alt="${server.name || 'Server'} icon" class="server-table-icon">` },
        name: { label: 'Name', defaultVisible: true, type: 'string' },
        member_count_approximate: { label: 'Members', defaultVisible: true, type: 'number' },
        member_count_online: { label: 'Online', defaultVisible: true, type: 'number' },
        description: { label: 'Description', defaultVisible: true, type: 'string', render: (server) => server.description || 'N/A' },
        added_timestamp: { label: 'Date Added', defaultVisible: true, type: 'date', render: (server) => new Date(server.added_timestamp).toLocaleDateString() },
        join: { label: 'Join', defaultVisible: true, render: (server) => `<a href="https://discord.gg/${server.invite_code}" target="_blank" rel="noopener noreferrer" class="join-button">Join</a>` },
        // Less common fields, hidden by default
        id: { label: 'Server ID', defaultVisible: false, type: 'string' },
        invite_code: { label: 'Invite Code', defaultVisible: false, type: 'string' },
        premium_subscription_count: { label: 'Boosts', defaultVisible: false, type: 'number' },
        features: { label: 'Features', defaultVisible: false, type: 'array', render: (server) => server.features.join(', ') || 'None' },
        verification_level: { label: 'Verification', defaultVisible: false, type: 'number' }, // Could map to string values
        vanity_url_code: { label: 'Vanity URL', defaultVisible: false, type: 'string', render: (server) => server.vanity_url_code || 'N/A' },
        nsfw: { label: 'NSFW', defaultVisible: false, type: 'boolean' },
        nsfw_level: { label: 'NSFW Level', defaultVisible: false, type: 'number' }, // Could map to string values
        last_checked_timestamp: { label: 'Last Checked', defaultVisible: false, type: 'date', render: (server) => new Date(server.last_checked_timestamp).toLocaleDateString() },
        // icon_hash: { label: 'Icon Hash', defaultVisible: false, type: 'string' }, // Usually not displayed directly
    };

    let visibleColumns = new Set(Object.keys(allColumns).filter(key => allColumns[key].defaultVisible));

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
                fetchServers();
            } else {
                displayMessage(result.error || 'Submission failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Submission error:', error);
            displayMessage('An error occurred during submission. Check console.', 'error');
        }
    });

    // --- Column Visibility Controls ---
    function initializeColumnControls() {
        columnVisibilityControls.innerHTML = '<h4>Show/Hide Columns:</h4>'; // Clear any existing
        Object.keys(allColumns).forEach(key => {
            const colConfig = allColumns[key];
            const label = document.createElement('label');
            label.style.marginRight = '10px';
            label.style.display = 'inline-block';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = key;
            checkbox.checked = visibleColumns.has(key);
            checkbox.addEventListener('change', (event) => {
                if (event.target.checked) {
                    visibleColumns.add(key);
                } else {
                    visibleColumns.delete(key);
                }
                renderServers();
            });
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + colConfig.label));
            columnVisibilityControls.appendChild(label);
        });
    }


    // --- Fetch and Display Servers ---
    async function fetchServers() {
        displayMessage('Fetching server list...', 'info');
        try {
            const githubUrl = `https://raw.githubusercontent.com/i-am-albert/pdsl/main/data/servers.json?timestamp=${new Date().getTime()}`;
            const response = await fetch(githubUrl);
            if (!response.ok) {
                if (response.status === 404) {
                    servers = [];
                    displayMessage('Server list is currently empty. Submit a server to get started!', 'info');
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            } else {
                servers = await response.json();
            }
            renderServers(); // Initial render after fetch
            if (servers.length > 0) displayMessage('Server list loaded.', 'success');

        } catch (error) {
            console.error('Error fetching servers:', error);
            servers = [];
            renderServers();
            displayMessage('Could not load server list. See console for details.', 'error');
        }
    }

    function renderServers() {
        serverTable.innerHTML = ''; // Clear existing rows
        serverTableHeader.innerHTML = ''; // Clear existing headers

        if (!servers || servers.length === 0) {
            noServersMessage.style.display = 'block';
            serverTable.style.display = 'none';
            serverTableHeader.style.display = 'none';
            return;
        }
        noServersMessage.style.display = 'none';
        serverTable.style.display = '';
        serverTableHeader.style.display = '';

        // Render Headers
        const headerRow = serverTableHeader.insertRow();
        Object.keys(allColumns).forEach(key => {
            if (visibleColumns.has(key)) {
                const colConfig = allColumns[key];
                const th = document.createElement('th');
                th.textContent = colConfig.label;
                th.dataset.sortKey = key;
                if (colConfig.type) { // Only allow sorting on columns with a defined type
                    th.classList.add('sortable');
                    if (currentSort.key === key) {
                        th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                    }
                    th.addEventListener('click', () => handleSort(key));
                }
                headerRow.appendChild(th);
            }
        });

        const sortedServers = sortServers(servers, currentSort.key, currentSort.direction);

        // Render Rows
        sortedServers.forEach(server => {
            const row = serverTable.insertRow();
            Object.keys(allColumns).forEach(key => {
                if (visibleColumns.has(key)) {
                    const colConfig = allColumns[key];
                    const cell = row.insertCell();
                    if (colConfig.render) {
                        cell.innerHTML = colConfig.render(server);
                    } else {
                        cell.textContent = server[key] !== undefined && server[key] !== null ? server[key].toString() : 'N/A';
                    }
                    // Apply text alignment based on type
                    if (colConfig.type === 'number' || colConfig.type === 'date') {
                        cell.style.textAlign = 'right';
                    } else {
                        cell.style.textAlign = 'left';
                    }
                }
            });
        });
    }

    // --- Sorting ---
    function handleSort(sortKey) {
        if (currentSort.key === sortKey) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.key = sortKey;
            currentSort.direction = 'asc';
        }
        renderServers();
    }

    function sortServers(serversToSort, key, direction) {
        if (!allColumns[key] || !allColumns[key].type) {
             return [...serversToSort]; // No sort if key or type invalid
        }

        return [...serversToSort].sort((a, b) => {
            let valA = a[key];
            let valB = b[key];
            const type = allColumns[key].type;

            if (type === 'string') {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
                return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else if (type === 'number') {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
                return direction === 'asc' ? valA - valB : valB - valA;
            } else if (type === 'date') {
                valA = new Date(valA).getTime() || 0;
                valB = new Date(valB).getTime() || 0;
                return direction === 'asc' ? valA - valB : valB - valA;
            } else if (type === 'boolean') {
                valA = valA === true;
                valB = valB === true;
                return direction === 'asc' ? (valA === valB ? 0 : valA ? -1 : 1) : (valA === valB ? 0 : valA ? 1 : -1);
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
        // Use only visible columns for CSV export headers, or all for JSON/TXT
        let dataToExport = data;
        let exportHeaders = Object.keys(allColumns);

        if (format === 'csv') {
             exportHeaders = Object.keys(allColumns).filter(key => visibleColumns.has(key));
             // For CSV, we might want to format the data similar to how it appears in the table
             dataToExport = data.map(server => {
                const row = {};
                exportHeaders.forEach(key => {
                    const colConfig = allColumns[key];
                    if (colConfig.render && typeof server[key] === 'object' && key !== 'icon' && key !== 'join') { // Avoid re-rendering complex HTML
                        row[key] = server[key]; // take raw data for objects
                    } else if (colConfig.render) {
                         row[key] = server[key]; // use raw for simpler ones or rely on server[key]
                    }
                     else {
                        row[key] = server[key] !== undefined && server[key] !== null ? server[key].toString() : '';
                    }
                    if (key === 'features' && Array.isArray(server[key])) {
                        row[key] = server[key].join(';'); // Use semicolon for array in CSV
                    }
                });
                return row;
             });
        }


        let content = '';
        let mimeType = '';
        let filename = `pdsl-servers.${format}`;

        if (format === 'json') {
            content = JSON.stringify(data, null, 2); // Export original full data for JSON
            mimeType = 'application/json';
        } else if (format === 'csv') {
            if (dataToExport.length > 0) {
                const displayedHeaderLabels = exportHeaders.map(key => allColumns[key].label);
                content = displayedHeaderLabels.join(',') + '\\n';
                dataToExport.forEach(server => {
                    content += exportHeaders.map(headerKey => {
                        let val = server[headerKey];
                        if (val === null || val === undefined) val = '';
                        return `"${val.toString().replace(/"/g, '""')}"`;
                    }).join(',') + '\\n';
                });
            }
            mimeType = 'text/csv';
        } else if (format === 'txt') { // TXT export will list all fields like before
            const originalHeaders = Object.keys(allColumns);
            data.forEach(server => {
                 originalHeaders.forEach(key => {
                    const colConfig = allColumns[key];
                    let value = server[key];
                    if (key === 'features' && Array.isArray(value)) value = value.join(', ');
                    else if (type === 'date' && value) value = new Date(value).toLocaleDateString();

                    content += `${colConfig.label}: ${value !== undefined && value !== null ? value : 'N/A'}\\n`;
                });
                content += `-------------------------------------\\n`;
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
    function displayMessage(message, type = 'info') {
        formMessage.textContent = message;
        formMessage.className = type;
    }

    function extractInviteCode(invite) {
        try {
            if (invite.includes('discord.gg/')) {
                return invite.split('discord.gg/')[1].split('/')[0];
            } else if (invite.includes('discord.com/invite/')) {
                return invite.split('discord.com/invite/')[1].split('/')[0];
            }
            if (/^[a-zA-Z0-9-]+$/.test(invite) && invite.length < 20) {
                return invite;
            }
        } catch (e) { /* ignore */ }
        return invite;
    }

    // --- Initial Load ---
    initializeColumnControls();
    fetchServers();
});

// Add to style.css (some already exist, new ones for table):
/*
.info { color: #3498db; font-weight: bold; }
.success { color: #2ecc71; font-weight: bold; }
.error { color: #e74c3c; font-weight: bold; }

table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
th, td { padding: 0.75rem; border: 1px solid #333; text-align: left; }
th.sortable { cursor: pointer; }
th.sortable:hover { background-color: #2c2c2c; }
th.sort-asc::after { content: ' ▲'; }
th.sort-desc::after { content: ' ▼'; }
.server-table-icon { width: 32px; height: 32px; border-radius: 50%; vertical-align: middle; margin-right: 8px; }
.join-button {
    padding: 5px 10px; background-color: #007bff; color: white; text-decoration: none; border-radius: 3px;
    font-size: 0.9em;
}
.join-button:hover { background-color: #0056b3; }
#column-visibility-controls label { font-size: 0.9em; }
*/ 