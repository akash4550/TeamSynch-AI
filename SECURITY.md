# Security Policy & Vulnerability Disclosure — TeamSynch AI

TeamSynch AI takes security seriously. We value the contributions of security researchers and the open-source community to help keep our platform, multi-tenant infrastructure, and user data secure.

---

## 🛡️ Supported Versions

Only the latest major version on the `main` branch receives active security updates and patch releases:

| Version | Supported | Security Maintenance Status |
| :--- | :---: | :--- |
| **1.0.x (main)** | ✅ Yes | Actively supported with security patches |
| **< 1.0.0** | ❌ No | Deprecated / Unsupported |

---

## 🔒 Reporting a Vulnerability

If you discover a security vulnerability or tenant-isolation flaw in TeamSynch AI, **please do not disclose it publicly or open a public GitHub issue.**

### Reporting Channels:
- **GitHub Private Vulnerability Reporting (Preferred):**
  Submit a private security report via [GitHub Security Advisories](https://github.com/akash4550/TeamSynch-AI/security/advisories/new).
- **Repository Maintainer Contact:**
  Contact the maintainers directly through GitHub profile messaging or opened maintainer advisories.

---

## 📋 What to Include in Your Report

To help us triage, reproduce, and fix the issue quickly, please include:

- **Type of Issue:** (e.g., Tenant Isolation Bypass, Cross-Tenant Data Access, Authentication Bypass, Privilege Escalation, Remote Code Execution, XSS, CSRF, Insecure Direct Object Reference).
- **Affected File & Line Range:** The specific repository file path, controller, or route handler.
- **Proof of Concept / Step-by-Step Reproduction:** Clear instructions or cURL commands demonstrating the exploit.
- **Impact Assessment:** Real-world impact on tenant data confidentiality, integrity, or availability.

---

## ⏱️ Response & Triage Goals (Non-Binding Targets)

- **Initial Acknowledgement Target:** 24–48 hours upon receipt.
- **Triage & Status Update Target:** 3–5 business days.
- **Patch & Release Target:** Critical or high-severity vulnerabilities will be prioritized for remediation in upcoming patch releases.

---

## 📜 Security Principles & Guardrails

- **Zero Cross-Tenant Data Bleed:** Every query, mutation, WebSocket connection, and vector search MUST be scoped by `organizationId`.
- **Deny-by-Default Authorization:** Unauthenticated or unauthorized endpoints are rejected by default.
- **No Plaintext Secrets:** Passwords are hashed with bcrypt, OAuth tokens are encrypted at rest with AES-256-GCM, and sensitive metadata is redacted from Winston logs.
- **Rootless Production Containers:** Container images run under unprivileged user privileges (`USER node`).
