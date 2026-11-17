# Diary: security & privacy design

## Threat model

| Threat | Mitigation |
|---|---|
| Server breach / data leak | There is no server. Personal data never leaves the device. |
| Someone picks up an unlocked phone or opens the browser | Data at rest is encrypted. Auto-lock after inactivity (1–30 min) and 2 minutes after the app is hidden. Locking drops the key from memory. |
| Device storage copied or inspected | Only ciphertext is stored: AES-256-GCM with a fresh 96-bit random IV on every save, plus authenticated associated data that separates the "check" record from the vault. |
| Passphrase guessing | PBKDF2-HMAC-SHA-256 with 600,000 iterations and a 128-bit random salt. The derived key is non-extractable. The unlock screen slows down after 5 failures (30 s, doubling, max 15 min). This is UX friction: an attacker with a copy of the storage is limited by the KDF, not by the lockout. |
| Malicious or tampered backup file | Strict schema validation, base64 checks, 50 MB limit, and a minimum of 100,000 KDF iterations, so a crafted backup can't downgrade protection. A tampered backup simply fails GCM authentication. |
| Cross-site scripting | No `innerHTML`, `eval` or HTML parsing of user text anywhere. The DOM is built with `textContent` and `createElement`. Strict CSP: `script-src 'self'`, no inline scripts. |
| Supply chain | Zero dependencies, no CDNs, no fonts or images from other origins. |
| Tracking / profiling | No analytics, cookies, ads or network calls. The service worker caches only the app's own files. |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY` (via `_headers`). |

## Known limits (stated honestly)

- **No recovery.** A forgotten passphrase means the data cannot be decrypted. Users are told this before setup, and backups are offered.
- **Compromised device.** Malware, keyloggers or malicious browser extensions on the device can read what the user types. No web app can defend against a fully compromised device.
- **Browser storage eviction.** Diary requests persistent storage. On iOS Safari, installing to the Home Screen makes storage far more durable. Regular encrypted backups are the real safeguard.
- **Mood log is not clinical.** The Digital Diet score is for reflection only. It does not diagnose or assess anyone.

## Standards referenced

- OWASP ASVS 4.0 (V6 Stored Cryptography, V5 Validation/Encoding, V14 Configuration)
- OWASP Password Storage Cheat Sheet (PBKDF2-HMAC-SHA-256 iteration count)
- NIST SP 800-38D (AES-GCM, unique IVs)
- WCAG 2.2 AA (labels, focus visibility, contrast, reduced motion, keyboard use)
- Privacy by design: no personal data is collected, consistent with India's DPDP Act 2023 and the GDPR's data-minimisation principle
