# VulneraX - Project Documentation

## 1. Overview
VulneraX is an AI-powered web application security assessment and vulnerability scanner platform. It allows users to actively scan target websites and networks, visualize risk scores, track detected vulnerabilities, and manage past scan histories through a sleek, interactive dashboard.

## 2. Tech Stack

### Frontend (Dashboard)
- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS 4 with custom CSS variables for seamless Light/Dark theming and premium "Glassmorphism" UI effects.
- **Icons & Animations**: Lucide React for iconography. Framer Motion & GSAP for smooth micro-animations and page transitions.
- **Charting**: Chart.js (`react-chartjs-2`) for dynamic visualizations like the Vulnerability Spectrum (Radar Chart) and Risk Score Gauge.
- **Routing**: React Router DOM (for navigating between Dashboard, History, Reports, Settings, etc.).

### Backend (API & Scanner Engine)
- **Framework**: FastAPI (served via Uvicorn for high performance).
- **Database**: SQLite (asynchronous via `aiosqlite`) using SQLAlchemy ORM.
- **Authentication**: JWT (JSON Web Tokens) generated using `PyJWT`, with `passlib[bcrypt]` for secure password hashing.
- **Scanning Engine**:
  - `python-nmap` for robust port scanning.
  - `aiohttp` / `httpx` / `requests` for fast, asynchronous HTTP requests and web crawling.
  - `beautifulsoup4` for HTML parsing, form extraction, and technology fingerprinting.
  - `python-whois` & `dnspython` for comprehensive DNS and domain registry lookups.
  - Custom heuristic modules for detecting SQL Injection (SQLi), Cross-Site Scripting (XSS), Path Traversal, and exposed Sensitive Files.

## 3. Project Structure

- **`/frontend`**: Contains the React dashboard application.
  - `/src/pages`: Top-level application views (Dashboard, History, Settings, Login).
  - `/src/components`: Reusable UI elements (MetricTiles, GlassCards, VulnPanels, Navigation bars).
  - `/src/api/client.js`: Axios instance configured with automatic JWT authorization headers and error interceptors.
- **`/backend`**: Contains the FastAPI application and core scanning logic.
  - `/api`: API endpoint routers (`auth.py` for user accounts, `scan.py` for launching/fetching scans).
  - `/core`: Security configuration (JWT settings) and application constants.
  - `/scanner`: The individual scanning modules (`banner.py`, `crawler.py`, `port_scanner.py`, `sqli.py`, `xss.py`, etc.).
  - `main.py`: The FastAPI application entry point.
  - `database.py`: Database connection setup and SQLAlchemy model definitions.

## 4. How It Works (System Flow)

1. **Authentication**: Users authenticate via the frontend Login page. The frontend sends credentials to `/api/auth/login`. If valid, a JWT token is returned and stored securely in the browser's `localStorage`.
2. **Initiating a Scan**: The user inputs a target URL on the Dashboard. The frontend sends an authenticated `POST` request to `/api/scan`.
3. **Execution**: The FastAPI backend asynchronously orchestrates a suite of scanner modules against the target domain. It resolves DNS, scans ports, analyzes headers, and injects test payloads to detect common web vulnerabilities.
4. **Data Storage**: Scan results—including calculated risk scores, open ports, and detailed vulnerability objects—are serialized and persisted in the local SQLite database (`scans/VulneraX.db`).
5. **Visualization**: The React frontend fetches the completed scan data (e.g., via `GET /api/scans/{scan_id}`) and dynamically renders interactive charts, metric tiles, and remediation panels.
6. **History & Management**: Past scans are logged on the History page. Users can review past reports or delete them (via `DELETE /api/scans/{scan_id}`), which permanently removes the record from the database.

## 5. Running the Application

A convenience launcher script is provided in the project root:
- **`start_vulnerax.bat`**: Double-clicking this script spawns two command prompt windows:
  - Starts the backend FastAPI server on `http://127.0.0.1:8000`
  - Starts the frontend Vite development server on `http://localhost:5175`
  - Automatically opens your default web browser to the dashboard.

## 6. Document Maintenance
*This document should be updated whenever new core technologies are added to `package.json` or `requirements.txt`, or when major architectural changes (like switching databases or adding new macro-features) are implemented.*
