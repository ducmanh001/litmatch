# Security policy

## Reporting a vulnerability

Do not open a public issue for credentials, authentication bypasses, payment/economy flaws,
or vulnerabilities that could expose user data. Use GitHub's private vulnerability reporting
when available; otherwise contact the repository owner privately before disclosure.

Include the affected commit, reproduction steps, expected impact, and the smallest safe proof
of concept. Never include real user data or production credentials.

## Credential handling

- Never place a token in a Git remote URL, source file, Docker image, issue, or CI log.
- Use GitHub CLI/credential manager for local Git authentication.
- Prefer short-lived OIDC credentials for CI/CD; do not create long-lived cloud access keys.
- If a credential is exposed, revoke it first, then remove it from every location and review
  relevant audit logs. Rewriting Git history is not a substitute for revocation.
