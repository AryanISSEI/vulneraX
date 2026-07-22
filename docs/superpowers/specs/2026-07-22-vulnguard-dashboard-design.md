# VulnGuard Dashboard Design

Date: 2026-07-22
Status: Approved design, ready for implementation planning

## Overview

This document defines the UI and frontend architecture for a modern cybersecurity dashboard for `VulnGuard: AI-Powered Security Assessment Platform`.

The dashboard should feel like a production-grade security operations product rather than a generic admin panel or a novelty cyberpunk screen. The design balances a deep dark visual system, premium glassmorphism surfaces, strong severity signaling, and a structured workflow that leads the user from scan initiation through findings review, AI-assisted threat interpretation, and report export.

The current frontend already contains scan-oriented views and components. The redesign should reuse the existing React, Vite, Tailwind, and Lucide foundations while reorganizing the experience into a more cohesive, modular, and responsive command-center layout.

## Goals

- Create a polished SOC-style dashboard with a strong cybersecurity product identity.
- Use a dark, high-tech visual system with clear contrast and disciplined accent usage.
- Make the scan workflow obvious: start assessment, monitor execution, inspect findings, review AI insight, export reports.
- Keep the UI modular so the dashboard can evolve without turning into a single oversized page component.
- Support responsive behavior across desktop and tablet screens.

## Non-Goals

- Building a fully feature-complete backend for every nav section.
- Replacing existing API behavior unless needed to support the new presentation layer.
- Designing a noisy terminal emulator or an effects-heavy cyberpunk interface that sacrifices clarity.
- Creating a mobile-first phone layout in this phase. Tablet and desktop are the primary targets.

## Visual System

### Theme

Use a deep dark mode UI with the following palette:

- Background base: `#0B0F17`
- Cyan accent: `#00F0FF`
- Crimson accent for critical alerts: `#FF3366`
- Emerald accent for safe and healthy states: `#10B981`
- Violet accent for AI-driven features: `#8B5CF6`

### Styling Principles

- Use Tailwind CSS for layout, spacing, typography, responsiveness, and state styling.
- Use semi-transparent frosted glass cards with backdrop blur for premium surfaces.
- Keep borders thin and crisp, with restrained glow for emphasis rather than constant decoration.
- Reserve crimson for danger and active risk states, emerald for operational health, and violet specifically for AI-driven content and predictions.
- Prefer clean typography and precise spacing over dense visual ornamentation.

### Interaction Mood

The dashboard should feel authoritative, technical, and premium. It should resemble a modern security assessment platform used by engineers and analysts, not a gaming HUD.

## Layout

### App Shell

The primary experience should use a persistent dashboard shell with:

- A fixed or anchored left sidebar.
- A top header region with quick scan controls.
- A responsive main content area that uses card grids and a two-column analysis layout on desktop.

The desktop layout should feel like a command center. The tablet layout should stack more aggressively while preserving the scan bar, metrics, and primary findings flow.

### Sidebar Navigation

The sidebar should include:

- App logo and `VulnGuard` brand text with a shield icon.
- Menu items:
  - Dashboard
  - New Scan
  - Target Assets
  - Vulnerabilities
  - Threat Predictions
  - Reports
  - Settings
- A bottom status badge that shows the system operational state.

Behavior notes:

- Dashboard is the main polished route and visual centerpiece.
- The other sections should exist as lightweight routed shells so the platform feels complete and navigable.
- The operational badge should use an emerald live-state indicator with concise status text such as `System Operational`.

### Header And Quick Scan Bar

The header area should prioritize the main action flow. It contains:

- A target input field with placeholder text like `Enter IP or Domain, e.g., target.example.com`.
- A scan options dropdown with:
  - Quick Port Scan
  - Full Vulnerability Audit
  - AI Threat Prediction
- A primary `Start Assessment` action button with a cyan-forward glowing treatment.

Behavior notes:

- On desktop, the input, selector, and action button should read like a single command strip.
- On tablet, the layout may wrap into two rows while preserving emphasis on the action button.
- Validation and error feedback should appear inline in the same command region.

## Dashboard Information Architecture

The dashboard should read in the following order:

1. Initiate scan
2. Monitor progress
3. Inspect findings
4. Interpret AI insights
5. Export reports

### Top Metrics Row

Display four high-visibility cards:

- Overall Risk Score
- Total Vulnerabilities Breakdown
- Active Scans
- System Security Health

Behavior notes:

- Use a four-column row on desktop and a two-by-two arrangement on tablet.
- These cards should be instantly scannable and should not depend on deep interaction to be understood.

### Main Analysis Area

Use a two-column analytical layout on desktop:

- Left column priority:
  - Active Scan Live Tracker
  - Discovered Vulnerabilities Table
- Right column priority:
  - AI Threat Prediction and posture summary
  - Attack path visualization
  - Reporting and export actions

On tablet, these sections should stack vertically in the same logical sequence.

## Core Components

### Overall Risk Score Card

The risk score card should feature:

- A circular or radial meter covering the 0 to 100 range.
- A centered numeric score.
- A compact textual label such as `Low Exposure`, `Moderate Exposure`, or `High Exposure`.

Color behavior:

- Emerald for low risk
- Amber or orange for moderate risk
- Crimson for high risk

### Total Vulnerabilities Breakdown

This card should summarize findings using severity chips or badges for:

- Critical
- High
- Medium
- Low

Each severity must have a clear count and strong color association. The counts should be readable at a glance without requiring hover or expansion.

### Active Scans Card

This metric summarizes currently running assessments. It should feel live, with subtle motion or status activity if a scan is in progress.

### System Security Health Card

This metric communicates platform-level health or the summarized health state of the assessed target, depending on available data. It should use emerald-friendly safe-state styling when conditions are strong.

### Active Scan Live Tracker

This section behaves like a collapsible mission log or execution panel. It should show the assessment pipeline as a multi-step progress stepper:

1. Network Recon (Nmap)
2. Web Crawl and Audit
3. AI Threat Synthesis
4. Report Generation

Step states:

- Queued
- Running
- Complete

Behavior notes:

- The active step is highlighted in cyan.
- The AI synthesis step uses violet accents to distinguish AI-driven processing from traditional scanning.
- The panel can collapse when the user wants to reclaim space, but it should default to expanded during an active scan.

### Discovered Vulnerabilities Table

The table must include the following columns:

- Vulnerability Name
- Target Endpoint
- CVE or Type
- Severity
- CVSS Score
- Actions

Action affordances:

- View Details
- Remediate

Filtering tabs:

- All
- Critical
- High
- OWASP Top 10

Behavior notes:

- Severity must be color-coded consistently across the application.
- The table should remain easy to scan, with strong row separation and readable density.
- Empty and loading states should still preserve the polished dashboard feel.

### AI Threat Prediction And Attack Path Panel

This area is the primary differentiator for the product. It should use violet accents and feel clearly distinct from scanner output.

The AI insights card should:

- Summarize the target's current security posture.
- Highlight predicted high-risk components or likely weak points.
- Provide concise narrative-style bullets rather than raw data only.

The attack path panel should:

- Show an interactive visual flow or a step-by-step attack chain tree.
- Communicate probable escalation paths in an immediately understandable form.
- Stay readable even if implemented first as a structured visual list before a richer graph treatment.

### Reporting And Export Section

This section should present downloadable report outputs as premium product cards rather than plain buttons.

Support at least:

- PDF export
- HTML export

Each report card should include:

- A short preview description
- A clear format label
- A direct download action

## Routing And Frontend Architecture

### Route Structure

Keep `Dashboard` as the main polished route. Add lightweight routed shells for:

- New Scan
- Target Assets
- Vulnerabilities
- Threat Predictions
- Reports
- Settings

These secondary routes do not need full business functionality in the first pass, but they should look intentional and aligned with the overall platform shell.

### Component Composition

Break the dashboard into focused, reusable components rather than one large page file. The recommended composition is:

- `CommandBar`
- `MetricsGrid`
- `LiveScanTracker`
- `VulnerabilityTable`
- `AIInsightsPanel`
- `AttackPathPanel`
- `ReportExports`

Recommended shared primitives:

- `GlassCard`
- `StatusBadge`
- `MetricTile`
- `SectionHeader`
- `SeverityPill`

### State Model

- Keep scan execution state, polling state, selected filters, and high-level result state near the page boundary.
- Keep presentational components mostly stateless and driven by structured props.
- Adapt backend result shapes into display-ready UI models once near the page layer rather than transforming raw data separately inside every child component.

### Data Adaptation Targets

The page-level transformation layer should derive:

- Severity counts
- Risk and health summaries
- Active scan progress step states
- AI insight bullets
- Attack-path nodes or steps
- Report metadata and actions

## Data Flow

The intended dashboard flow is:

1. User enters a target and selects a scan mode.
2. The dashboard starts a scan job.
3. The live tracker polls and updates step state.
4. Completed results are normalized into dashboard-ready structures.
5. Metrics, findings, AI panels, and report cards render from the normalized result object.

This flow should keep the user on a single coherent screen rather than pushing them through multiple disconnected pages.

## Loading, Empty, And Error States

### Loading States

- Every major panel should have a deliberate loading or skeleton state.
- The page should feel active and premium while waiting, not blank or broken.
- The scan tracker should visibly communicate in-progress work.

### Empty States

Before a scan runs, the dashboard should still look complete. Use polished standby messaging such as:

- `Awaiting target input`
- `No live assessments`
- `No vulnerabilities to display yet`

Empty states should reinforce the platform identity instead of looking like missing content.

### Error Handling

- Scan launch failures should appear inline near the command bar in a high-visibility critical alert treatment.
- If part of the result payload is unavailable, degrade gracefully by showing a targeted unavailable state inside the affected panel rather than collapsing the whole dashboard.
- Severity styling should make critical problems obvious without overwhelming the entire page.

## Responsiveness

Primary targets are desktop and tablet.

Desktop expectations:

- Full sidebar visible
- Multi-column metrics
- Two-column analysis area
- Rich use of horizontal space

Tablet expectations:

- Content stacks cleanly
- Command bar remains prominent
- Metrics shift to a two-by-two grid
- Tables remain readable with controlled overflow or simplified presentation

## Accessibility And Usability

- Maintain strong contrast on all dark surfaces.
- Do not rely on glow or color alone for meaning; pair severity and status colors with labels or icons.
- Keep buttons, tabs, and dropdowns comfortably clickable.
- Preserve keyboard focus visibility within the dark theme.
- Use consistent iconography from Lucide React.

## Testing Strategy

Focus testing on the highest-risk interactions and states:

- Route rendering for the primary shell and secondary placeholder routes
- Scan mode selection behavior
- Command bar validation and inline error display
- Live tracker step state rendering
- Vulnerability severity filtering tabs
- Empty, loading, active-scan, completed-result, and error views

Prefer a combination of:

- Focused component tests for interaction-heavy UI pieces
- A lightweight end-to-end smoke path covering `enter target -> start assessment -> render dashboard results`

## Implementation Notes

- Reuse the current React, Vite, Tailwind, and Lucide setup.
- Refresh visual theme tokens in the global stylesheet to the approved palette and mood.
- Reorganize the existing scan-oriented UI into a product-grade dashboard shell rather than replacing the entire app architecture.
- Favor modular sections and shared UI primitives to reduce future redesign churn.

## Success Criteria

The redesign is successful when:

- The application looks like a real premium cybersecurity product.
- The main dashboard clearly communicates scan initiation, live progress, findings, AI predictions, and reporting.
- The visual hierarchy is crisp and readable across desktop and tablet.
- The implementation remains modular enough to extend without bloating the main page component.
- Severity, safety, and AI states are visually distinct and consistently applied throughout the UI.
