<div align="center">
  <img src="https://img.shields.io/badge/Security-VulneraX-red?style=for-the-badge&logo=shield" alt="VulneraX Logo" />
  <br/>
  <h1>VulneraX</h1>
  <p><b>Advanced AI-Powered Web Application Security Scanner</b></p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Gemini_AI-Enabled-orange?logo=googlegemini&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white" />
</p>

## 🚀 Overview

**VulneraX** is a modern, high-performance web security assessment platform. It blends traditional vulnerability scanning with **Generative AI** to not only find security flaws but also explain the threat chain and provide concrete, actionable code patches. 

Featuring a stunning "Glassmorphism" UI, interactive 3D attack graphs, and real-time scanning progress, VulneraX is designed for developers and security engineers who demand both aesthetics and deep technical insights.

## ✨ Key Features

- **🛡️ Comprehensive Scanning**: Detects SQL Injection (SQLi), Cross-Site Scripting (XSS), Path Traversal, missing security headers, exposed sensitive files, and SSL/TLS misconfigurations.
- **🤖 AI-Powered Remediation**: Integrates with Google Gemini to generate executive threat intelligence reports, exploit reasoning, and exact code patches for your specific tech stack.
- **🕸️ Interactive Attack Graph**: Visualize connected ports and potential lateral movement vectors using a dynamic force-directed node graph.
- **🔐 Authenticated Scans**: Test protected routes by providing custom HTTP headers and session cookies directly from the dashboard.
- **📄 Professional Reporting**: Export your security assessments in **PDF, CSV, HTML, or JSON** formats with just one click.
- **🎨 Premium UI/UX**: Built with React 19, Tailwind CSS 4, Framer Motion, and GSAP for buttery smooth animations and dark-mode by default.

## 🛠️ Technology Stack

| Component | Technologies Used |
|-----------|-------------------|
| **Frontend** | React 19, Vite, Tailwind CSS 4, GSAP, Framer Motion, Lucide React, React Flow (`@xyflow/react`), Axios |
| **Backend** | FastAPI, Uvicorn, SQLAlchemy, `aiosqlite`, PyJWT |
| **Scanner Engine** | `python-nmap`, `aiohttp`, `beautifulsoup4`, `python-whois`, `dnspython` |
| **Reporting & AI** | Google Generative AI (`gemini-1.5-pro`), `fpdf2`, `Jinja2` |

## ⚙️ Getting Started

### Prerequisites
- Node.js (for the frontend)
- Python 3.11+ (for the backend)
- Nmap installed and accessible in your system PATH.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AryanISSEI/vulneraX.git
   cd vulneraX
   ```

2. **Configure your AI API Key:**
   Add your Google Gemini API key to the backend environment variables to enable AI threat intelligence.

3. **Run the Application (Windows):**
   Simply double-click the `start_vulnerax.bat` file! 
   This will automatically launch the FastAPI backend, the React frontend, and open your browser to `http://localhost:5175`.

## 📖 Project Documentation
For a deep dive into the architecture, system flow, and folder structure, please refer to the [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md).

## 🔒 Disclaimer
VulneraX is designed for **authorized security assessments and educational purposes only**. Always ensure you have explicit permission before scanning any target network or web application.
