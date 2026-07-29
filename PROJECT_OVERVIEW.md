# VulneraX - The Scanner That Explains Attacks

VulneraX is a comprehensive Security Assessment Platform. Instead of just dumping a list of 50 disconnected vulnerabilities, VulneraX aims to correlate findings, map them to standard risk scores, and use intelligence to explain the actual business impact and attack chains.

## 🏗️ Architecture

```text
React Dashboard
      ↓
FastAPI Backend
      ↓
Authentication
      ↓
Scan Orchestrator
      ↓
Task Queue (FastAPI BackgroundTasks / Redis + Celery)
      ↓
Scanning Modules
      ↓
Security Intelligence Engine
      ↓
Reports
      ↓
Database
```

### Core Technologies
- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion, GSAP, Radix UI.
- **Backend:** FastAPI, Uvicorn.
- **Database:** SQLite (Development) → PostgreSQL (Production) via SQLAlchemy/asyncpg.
- **Orchestration:** Task Queue (currently async BackgroundTasks, planned migration to Redis + Celery/RQ).

## ✅ Current Features

- **Standard Vulnerability Scanning:** Executes checks for XSS, SQLi, Open Ports, SSL misconfigurations, Path Traversal, Sensitive Files, and unvalidated redirects.
- **Interactive Dashboard:** Modern UI built with React to view scan statuses in real-time, visualize metrics, and manage reports.
- **AI Vulnerability Explanation:** Integrates with `google-generativeai` to provide detailed markdown explanations of single vulnerabilities (Danger Level, Exploitation, Protection).
- **Asynchronous Execution:** Scans run asynchronously in the background, allowing the user to navigate the platform without blocking the UI.
- **Reporting:** Basic PDF report generation with `fpdf2`.

## 🔮 Planned Features (Roadmap Highlights)

*See `ROADMAP.md` for the full roadmap.*

- **Security Intelligence Engine:** A factual pipeline that uses a Knowledge Graph and Correlation Rules to build attack chains, and an LLM to explain them.
- **Extensive Asset Discovery Pipeline:** `Target → DNS → WHOIS → Subdomains → Certificates → IP → ASN → Open Ports → Services → Technologies → Vulnerabilities`.
- **Deep Threat Intelligence:** Enriching findings with CVE, EPSS, MITRE ATT&CK, CISA KEV, CWE, CAPEC, and OWASP Top 10 mappings.
- **Attack Surface Dashboard:** `Projects → Assets → Hosts → Services → Risks`.
- **Enterprise Reporting:** Security Scorecards (Overall, Auth, Headers, API, etc.) and Audience-Specific Reports (Executive, Developer, Compliance).

---

## 🧠 Security Intelligence Engine (Planned Pipeline)

VulneraX will utilize a Security Intelligence Engine to shift from "vulnerability scanning" to factual "attack path mapping". The LLM explains the facts; it does not hallucinate the graph.

```text
Scanner Results
      ↓
Normalizer
      ↓
Knowledge Graph
      ↓
Rule Engine (Correlation)
      ↓
LLM Explanation (Gemini)
      ↓
Attack Chain Generation
      ↓
Priority & Risk Assignment
      ↓
Final Report
```

**Example Fact-Based Attack Graph:**
`Apache → Known CVE → RCE → Privilege Escalation`

Instead of isolated alerts (`Missing CSP` + `Stored XSS` + `No HttpOnly`), the engine uses rules to correlate them into an attack chain (e.g., **Possible Account Takeover**), and the LLM explains the impact to the user.

---

## ⚙️ How to Run
A convenient `run.bat` script is provided in the root directory to launch the entire stack:
1. It starts the **Backend API** on `http://localhost:8000`.
2. It starts the **Frontend UI** on `http://localhost:5173`.
