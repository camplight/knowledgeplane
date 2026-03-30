# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Knowledge Plane, please report it responsibly.

**Email:** security@camplight.net

**Please do NOT open a public GitHub issue for security vulnerabilities.**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if you have one)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 5 business days
- **Fix timeline:** Depends on severity, typically within 30 days for critical issues

### Disclosure

We follow coordinated disclosure:

1. Confirm the vulnerability and determine its impact
2. Develop and test a fix
3. Release the fix and publish an advisory
4. Credit the reporter (if desired) in the CHANGELOG and release notes

We ask that you do not publicly disclose the vulnerability until a fix is available.

## Scope

- All code in this repository
- The official Docker images
- The deployment configurations in `infra/`

## Out of Scope

- Third-party dependencies (please report to their maintainers directly)
- Issues in services Knowledge Plane connects to (ArangoDB, ngrok, etc.)

## Recognition

We appreciate security researchers who help keep Knowledge Plane safe. With your permission, we will acknowledge your contribution in our CHANGELOG and release notes.
