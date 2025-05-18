document.addEventListener('DOMContentLoaded', () => {
    const inviteForm = document.getElementById('invite-form');
    const inviteLinkInput = document.getElementById('invite-link');
    const formMessage = document.getElementById('form-message');
    // const serverListSection = document.getElementById('server-list'); // Old, replaced by table
    const serverTable = document.getElementById('server-table').getElementsByTagName('tbody')[0];
    const serverTableHeader = document.getElementById('server-table').getElementsByTagName('thead')[0];
    const noServersMessage = document.getElementById('no-servers-message');
    const columnVisibilityControls = document.getElementById('column-visibility-controls');
    const searchBar = document.getElementById('search-bar'); // Added search bar

    const exportJsonButton = document.getElementById('export-json');
    const exportCsvButton = document.getElementById('export-csv');
    const exportTxtButton = document.getElementById('export-txt');

    const WORKER_URL = 'https://pdsl-worker.ytalberta.workers.dev';

    let servers = [];
    let filteredServers = []; // For search results
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

    // --- Search Functionality ---
    searchBar.addEventListener('input', () => {
        applySearch();
        renderServers();
    });

    function applySearch() {
        const searchTerm = searchBar.value.toLowerCase().trim();
        if (!searchTerm) {
            filteredServers = [...servers];
            return;
        }

        filteredServers = servers.filter(server => {
            // Search in name, description, and invite_code by default
            // Also search in any currently visible string or array type column
            return (
                (server.name && server.name.toLowerCase().includes(searchTerm)) ||
                (server.description && server.description.toLowerCase().includes(searchTerm)) ||
                (server.invite_code && server.invite_code.toLowerCase().includes(searchTerm)) ||
                Object.keys(allColumns).some(key => 
                    visibleColumns.has(key) && 
                    server[key] &&
                    (allColumns[key].type === 'string' || allColumns[key].type === 'array') &&
                    (Array.isArray(server[key]) 
                        ? server[key].join(' ').toLowerCase().includes(searchTerm) 
                        : server[key].toString().toLowerCase().includes(searchTerm))
                )
            );
        });
    }

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
                // Use a more specific message from the worker if available, otherwise a generic one.
                const successMessage = result.message && result.message.includes('submitted successfully') 
                    ? result.message + ' It may take a few minutes to appear on the list.' 
                    : 'Server submitted successfully! It may take a few minutes to appear on the list.';
                displayMessage(successMessage, 'success');
                inviteLinkInput.value = '';
                fetchServers(); // This will call applySearch and renderServers indirectly
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
                    // displayMessage('Server list is currently empty. Submit a server to get started!', 'info'); // Message handled in renderServers
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            } else {
                servers = await response.json();
            }
            applySearch(); // Apply search immediately after fetching/re-fetching all servers
            renderServers(); // Then render. renderServers will use filteredServers if search is active.
            
            // Update status message based on whether any servers (filtered or not) are loaded.
            if (servers.length > 0 && searchBar.value.trim().length === 0) {
                 displayMessage('Server list loaded.', 'success');
            } else if (servers.length > 0 && filteredServers.length > 0 && searchBar.value.trim().length > 0) {
                 displayMessage(`Found ${filteredServers.length} server(s) matching your search.`, 'success');
            } else if (servers.length > 0 && filteredServers.length === 0 && searchBar.value.trim().length > 0) {
                displayMessage('No servers match your search.', 'info');
            } else { // servers.length === 0
                 displayMessage('Server list is currently empty. Submit a server to get started!', 'info');
            }

        } catch (error) {
            console.error('Error fetching servers:', error);
            servers = [];
            applySearch(); // Ensure filteredServers is also empty
            renderServers();
            displayMessage('Could not load server list. See console for details.', 'error');
        }
    }

    function renderServers() {
        serverTable.innerHTML = ''; // Clear existing rows
        serverTableHeader.innerHTML = ''; // Clear existing headers

        // Determine which list to use: all servers or filtered servers
        const currentServerList = searchBar.value.trim() ? filteredServers : servers;

        if (!currentServerList || currentServerList.length === 0) {
            noServersMessage.style.display = 'block';
            serverTable.style.display = 'none';
            serverTableHeader.style.display = 'none';
            if (searchBar.value.trim() && servers.length > 0) { // Search active but no results from original list
                noServersMessage.textContent = 'No servers match your search.';
            } else { // No servers at all, or search is empty and no servers
                noServersMessage.textContent = 'No servers listed yet. Be the first to submit one!';
            }
            return;
        }
        noServersMessage.style.display = 'none';
        serverTable.style.display = '';
        serverTableHeader.style.display = '';

        // Render Headers
        const headerRow = serverTableHeader.insertRow();
        Object.keys(allColumns).forEach((key, index, arr) => { // Added index and arr for resize handle logic
            if (visibleColumns.has(key)) {
                const colConfig = allColumns[key];
                const th = document.createElement('th');
                th.style.position = 'relative'; // For positioning resize handle

                const titleSpan = document.createElement('span');
                titleSpan.textContent = colConfig.label;
                th.appendChild(titleSpan);
                
                th.dataset.sortKey = key;
                th.classList.add(`col-${key.replace(/_/g, '-')}`);
                if (colConfig.type) {
                    th.classList.add('sortable');
                    if (currentSort.key === key) {
                        th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                    }
                    // Event listener for sorting will be on titleSpan to avoid conflict with resize
                    titleSpan.addEventListener('click', () => handleSort(key)); 
                } else {
                    // If not sortable, still make the titleSpan clickable for consistency if needed in future
                    // or just let it be plain text.
                }

                // Add resize handle to all but the last visible column header
                // Check if this is not the last *visible* column
                const visibleKeys = arr.filter(k => visibleColumns.has(k));
                const currentIndexInVisible = visibleKeys.indexOf(key);

                if (currentIndexInVisible < visibleKeys.length - 1) {
                    const resizeHandle = document.createElement('div');
                    resizeHandle.classList.add('resize-handle');
                    resizeHandle.addEventListener('mousedown', (e) => initResize(e, th));
                    th.appendChild(resizeHandle);
                }
                headerRow.appendChild(th);
            }
        });

        const sortedServers = sortServers(currentServerList, currentSort.key, currentSort.direction);

        // Render Rows
        sortedServers.forEach(server => {
            const row = serverTable.insertRow();
            Object.keys(allColumns).forEach(key => {
                if (visibleColumns.has(key)) {
                    const colConfig = allColumns[key];
                    const cell = row.insertCell();
                    cell.classList.add(`col-${key.replace(/_/g, '-')}`); // Add class for styling td
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
        const colType = allColumns[sortKey] ? allColumns[sortKey].type : null;
        if (currentSort.key === sortKey) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.key = sortKey;
            // For numbers or dates, default to descending on first click. Otherwise ascending.
            if (colType === 'number' || colType === 'date') {
                currentSort.direction = 'desc';
            } else {
                currentSort.direction = 'asc';
            }
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
    exportJsonButton.addEventListener('click', () => exportData(filteredServers, 'json'));
    exportCsvButton.addEventListener('click', () => exportData(filteredServers, 'csv'));
    exportTxtButton.addEventListener('click', () => exportData(filteredServers, 'txt'));

    function exportData(data, format) {
        if (!data || data.length === 0) {
            displayMessage('No data to export (or no servers match current search).', 'info');
            return;
        }
        
        let dataToExport = JSON.parse(JSON.stringify(data)); // Deep copy to avoid modifying original filtered/sorted data
        let content = '';
        let mimeType = '';
        let filename = `pdsl-servers.${format}`;

        // Filter data for export based on visible columns for JSON and TXT
        // CSV already uses a filtered header list later
        if (format === 'json' || format === 'txt') {
            dataToExport = dataToExport.map(server => {
                const filteredServer = {};
                Object.keys(allColumns).forEach(key => {
                    if (visibleColumns.has(key)) {
                        if (key === 'join') {
                            filteredServer[key] = `https://discord.gg/${server.invite_code}`;
                        } else {
                            filteredServer[key] = server[key];
                        }
                    }
                });
                return filteredServer;
            });
        }

        if (format === 'json') {
            content = JSON.stringify(dataToExport, null, 2);
            mimeType = 'application/json';
        } else if (format === 'csv') {
            const csvHeaders = Object.keys(allColumns).filter(key => visibleColumns.has(key));
            const displayedHeaderLabels = csvHeaders.map(key => allColumns[key].label);
            content = displayedHeaderLabels.join(',') + '\\\n';
            
            dataToExport.forEach(server => {
                content += csvHeaders.map(headerKey => {
                    let val;
                    if (headerKey === 'join') {
                        val = `https://discord.gg/${server.invite_code}`;
                    } else if (allColumns[headerKey].render && typeof server[headerKey] !== 'string' && typeof server[headerKey] !== 'number' && typeof server[headerKey] !== 'boolean') {
                        // For complex render outputs that aren't simple types, try to get a meaningful string
                        // or just use the raw data if it's an array/object that needs special handling below
                        if (Array.isArray(server[headerKey])) {
                            val = server[headerKey].join('; '); // e.g. features array
                        } else if (typeof server[headerKey] === 'object' && server[headerKey] !== null) {
                            // If it's an object and not handled by a specific type, get a string representation
                            // This case might need more specific handling based on actual data structure
                            val = JSON.stringify(server[headerKey]); 
                        } else {
                            val = server[headerKey]; // Fallback
                        }
                    } else {
                        val = server[headerKey];
                    }

                    if (allColumns[headerKey].type === 'date' && val) {
                        val = new Date(val).toLocaleDateString();
                    }

                    if (val === null || val === undefined) val = '';
                    return `"${val.toString().replace(/"/g, '""')}"`;
                }).join(',') + '\\\n';
            });
            mimeType = 'text/csv';
        } else if (format === 'txt') {
            dataToExport.forEach(server => {
                Object.keys(server).forEach(key => { // server object here is already filtered by visible columns
                    const colConfig = allColumns[key];
                    let value = server[key];
                    if (colConfig.type === 'array' && Array.isArray(value)) {
                        value = value.join(', ');
                    } else if (colConfig.type === 'date' && value && !(value instanceof Date)) {
                         // If it's not already a Date object (e.g. from join link creation)
                        if (key !== 'join') value = new Date(value).toLocaleDateString(); 
                    }
                     // Join link is already formatted correctly
                    content += `${colConfig.label}: ${value !== undefined && value !== null ? value : 'N/A'}\\\\n`;
                });
                content += `-------------------------------------\\\\n`;
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

    // --- Column Resizing Logic (Simplified) ---
    let currentThToResize;
    let startX, startWidth;

    function initResize(e, th) {
        e.stopPropagation(); // Prevent sort click when dragging handle
        currentThToResize = th;
        startX = e.pageX;
        startWidth = currentThToResize.offsetWidth;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResize);
        // Add a class to body to indicate resizing and change cursor globally
        document.body.classList.add('resizing-cols'); 
    }

    function handleMouseMove(e) {
        if (!currentThToResize) return;
        const diffX = e.pageX - startX;
        let newWidth = startWidth + diffX;
        const minWidth = 50; // Minimum column width
        if (newWidth < minWidth) newWidth = minWidth;

        currentThToResize.style.width = `${newWidth}px`;
        currentThToResize.style.minWidth = `${newWidth}px`; // Ensure min-width is also set
        currentThToResize.style.maxWidth = `${newWidth}px`; // Optional: force exact width

        // Adjust corresponding cells in the body - this can be performance intensive
        // For a simpler approach, CSS table-layout:fixed and setting width on TH might be enough
        // but for direct manipulation like this, we might need to iterate.
        // For now, we rely on the TH width influencing the column.
        // More robust solutions would use a <col> element or update all cells.
    }

    function stopResize() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResize);
        currentThToResize = null;
        document.body.classList.remove('resizing-cols');
    }

    // --- Initial Load ---
    initializeColumnControls();
    fetchServers(); // This will call applySearch and then renderServers
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