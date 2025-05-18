# Public Discord Server List (PDSL)

![PDSL Logo](pdsl.png)

PDSL is a simple, self-hostable directory for public Discord servers. It allows users to submit Discord invite links, which are then validated and added to a publicly viewable list. The list is displayed on a static webpage and can be searched, sorted, and exported.

## Features

*   **Server Submission:** Users can submit Discord invite links/codes.
*   **Validation:**
    *   Verifies invite codes with the Discord API.
    *   Ensures invites are permanent.
    *   Checks for duplicate server entries.
*   **Dynamic List Display:**
    *   Servers are displayed in a sortable and filterable table.
    *   Users can choose which columns (server details) to display.
    *   Dark mode interface.
*   **Data Storage:** Server data is stored in a `servers.json` file within the GitHub repository.
*   **Export Options:** The server list can be exported in JSON, CSV, or TXT format. Exported data respects current search filters and visible columns.
*   **Periodic Refresh (Optional):** A Cloudflare Worker cron trigger can be configured to periodically refresh server details (name, member count, etc.) and remove invalid/expired invites.

## Core Components

1.  **Frontend (`index.html`, `style.css`, `script.js`):**
    *   A static webpage hosted via GitHub Pages (or any static host).
    *   Handles user interaction: submitting new servers, viewing the list, searching, sorting, customizing visible columns, and exporting data.
2.  **Cloudflare Worker (`worker/index.js`, `worker/wrangler.toml`):**
    *   Acts as the backend API.
    *   Handles `/submit` requests:
        *   Validates Discord invites using the `DISCORD_BOT_TOKEN`.
        *   Fetches the current `servers.json` from the GitHub repository using `GITHUB_TOKEN`.
        *   Adds valid new servers to the list.
        *   Commits the updated `servers.json` back to the GitHub repository.
    *   Can be configured with a cron trigger (`[schedules]` in `wrangler.toml`) to run a `handleScheduled` function that refreshes all server data.
    *   Serves `/servers` (optional, frontend currently fetches raw JSON from GitHub).
3.  **Data Store (`data/servers.json`):**
    *   A JSON file in the GitHub repository containing the list of submitted and validated servers.

## Setup & Deployment

### Prerequisites

*   A GitHub account and a repository for this project.
*   A Cloudflare account.
*   A Discord Bot Token with necessary permissions (typically just `bot` scope for invite validation).
*   Node.js and npm installed for using Wrangler CLI (Cloudflare's tool for worker development).

### Steps

1.  **Clone the Repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-name>
    ```

2.  **Configure Cloudflare Worker:**
    *   Navigate to the `worker/` directory.
    *   Rename `wrangler.toml.example` to `wrangler.toml` (if an example is provided, otherwise, ensure your `wrangler.toml` is configured).
    *   Update `wrangler.toml` with your Cloudflare `account_id` and a unique `name` for your worker.
    *   **Secrets:** Set the following secrets for your worker using the Wrangler CLI or the Cloudflare dashboard:
        *   `DISCORD_BOT_TOKEN`: Your Discord bot token.
        *   `GITHUB_TOKEN`: A GitHub Personal Access Token with `repo` scope (to read and write `data/servers.json`).
    *   Update constants in `worker/index.js` if needed (though most are passed as environment variables now or are repo specific like `GITHUB_USERNAME`, `GITHUB_REPONAME`).

3.  **Deploy the Worker:**
    ```bash
    cd worker
    npx wrangler deploy # Or `wrangler publish` for older versions
    ```
    Note the URL of your deployed worker.

4.  **Configure Frontend:**
    *   Open `script.js` in the root directory.
    *   Update the `WORKER_URL` constant with your deployed Cloudflare Worker URL.
    *   Update the GitHub raw content URL in `fetchServers` if your username, repository name, or branch for `data/servers.json` differs from `https://raw.githubusercontent.com/i-am-albert/pdsl/main/data/servers.json`.

5.  **GitHub Pages Setup:**
    *   Push your project to your GitHub repository.
    *   Go to your repository settings on GitHub.
    *   Under the "Pages" section, configure GitHub Pages to build from your `main` (or `master`) branch and the `/ (root)` directory.
    *   Your PDSL site will be live at `https://<your-username>.github.io/<your-repository-name>/`.

6.  **(Optional) Enable Scheduled Refresh:**
    *   In `worker/wrangler.toml`, uncomment or add the `[schedules]` section:
        ```toml
        # [schedules]
        # cron = "0 0 * * *" # Runs daily at midnight UTC
        ```
    *   In `worker/index.js`, uncomment the `addEventListener('scheduled', ...)` block at the end of the file.
    *   Redeploy your worker (`npx wrangler deploy` from the `worker` directory).

## Usage

*   **Submit a Server:** Enter a Discord invite link or code into the submission form and click "Submit."
*   **View Servers:** The list will load automatically.
*   **Search:** Use the search bar to filter servers by name, description, invite code, or other visible text-based fields.
*   **Sort:** Click on table headers (e.g., Name, Members) to sort the list.
*   **Customize Columns:** Use the checkboxes to show or hide specific server details in the table.
*   **Export:** Click the export buttons (JSON, CSV, TXT) to download the currently displayed server list (respecting search filters and visible columns).

## Contributing

Contributions, issues, and feature requests are welcome. Please feel free to fork the repository and submit a pull request.

---

*This README provides a general setup guide. Specific configurations might vary based on your environment.* 