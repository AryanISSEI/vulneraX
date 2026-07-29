# VulneraX - Project Roadmap

This roadmap is designed to elevate VulneraX from "just another scanner" to **"the scanner that explains attacks"**, focusing heavily on intelligence, correlation, and professional-grade security assessments.

---

## 🎯 Phase 1: MVP & Foundation (Current Focus)
**Goal:** Build a complete, professional-grade core product. Do not expand scope until these features are rock solid.

* **Extensive Asset Discovery Pipeline:** 
  * Map the attack surface, not just a single URL.
  * `Target → DNS → WHOIS → Subdomains → Certificates → IP → ASN → Open Ports → Services → Technologies → Vulnerabilities`
* **API & Web Security Scanning:** 
  * Modern targets care about APIs. Deep support for REST, GraphQL, JWT validation, Mass Assignment, and BOLA (Broken Object Level Authorization).
* **Standards-Based Scoring:** Replace custom risk scores with industry standards: **CVSS** and **EPSS**.
* **Security Intelligence Engine (V1):**
  * Generate factual attack chains (e.g., `Apache → Known CVE → RCE → Privilege Escalation`).
  * AI explains the impact of these factual chains, rather than hallucinating the graph itself.
* **Professional Reports:**
  * Include a Security Scorecard for management (e.g., Overall Score, Authentication, Headers, TLS, API Security, Critical Issues).

---

## 🚀 Phase 2: Security Intelligence Engine
**Goal:** Shift the platform's value from raw data collection to actionable security intelligence.

* **The Intelligence Pipeline:** 
  * `Knowledge Graph → Correlation Rules → Threat Intelligence → LLM Explanation → Attack Prioritization`
  * The LLM is just one component used for explanation, not the sole decision-maker.
* **Deep Threat Intelligence Enrichment:** 
  * Map vulnerabilities to: `CVE → EPSS → MITRE ATT&CK → CISA KEV → CWE → CAPEC → OWASP Top 10`.
* **Cross-Scan AI Memory:** 
  * The engine remembers past scans (e.g., "SQL Injection still unresolved after 90 days") and highlights persistent risks.
* **Attack Surface Dashboard:** 
  * Shift focus from raw scans to the true attack surface.
  * `Projects → Assets → Hosts → Services → Risks`
* **Audience-Specific Reporting:** 
  * Generate different report formats based on the audience: **Executive** (high-level risk), **Developer** (remediation steps), and **Compliance** (standards mapping).

---

## 🧠 Phase 3: Enterprise Features & Modern Targets
**Goal:** Support complex, modern application architectures, team collaboration, and large-scale deployments.

* **Enterprise Search:** 
  * Global search across all data (`Search → SQL Injection → All projects → All reports`).
* **Advanced Crawling:** Implement Playwright-based crawling to handle JavaScript-heavy Single Page Applications (SPAs) and authenticated scanning.
* **Docker & CI/CD:** 
  * Create `docker-compose.yml` for one-command startup (API, Frontend, Database, Redis, Celery Workers).
  * Setup GitHub Actions for linting, integration testing, and security scanning.
* **Robust Task Orchestration:** Migrate from background jobs to Redis + Celery/RQ for production-grade task scheduling and module dependency orchestration.
* **Team Collaboration & Automation:**
  * Scheduled Scans (Daily/Weekly/Monthly).
  * Notification integrations (Slack, Discord, Teams, Email).
