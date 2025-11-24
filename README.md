# domain-status-checker
A simple web application to check the availability and status of domains. Users can either paste a list of domains (comma-separated or one per line) or upload a text file containing domains. The app checks each domain’s HTTP status, whether it’s reachable, and the final resolved URL. Results are displayed in a table and can be downloaded as a CSV file.

Features:

Paste domains in a textarea or upload a .txt file.

Check multiple domains at once.

Displays results in a table: domain, URL, reachable status, HTTP status code, final URL.

Green/red coloring for reachable/unreachable domains.

Download results as a CSV file.

Fully client-server architecture using Node.js + Express for the backend and vanilla JavaScript for the frontend.

Tech stack:

Backend: Node.js, Express

Frontend: HTML, CSS, JavaScript

No frameworks required — lightweight and easy to deploy.

Usage:

Clone the repository.

Run npm install to install dependencies.

Start the server with npm start.

Open your browser at http://localhost:3000.

Paste or upload domains, click “Check Domains,” and view/download results.

Optional:

Can handle large lists of domains.

Designed to be lightweight and minimal — easy to host anywhere Node.js is supported.
