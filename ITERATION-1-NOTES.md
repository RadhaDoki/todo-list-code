# Iteration 1 — Email Login Without External Delivery

This iteration intentionally has **no Amazon SNS, SMS, or SES dependency**.

Authentication uses an email address. The backend generates and hashes a 6-digit OTP, stores it in PostgreSQL, enforces expiry/attempt/cooldown rules, and issues a JWT after successful verification.

For the lab, `OTP_DELIVERY_MODE=console` prints the generated OTP in the backend container logs. This is deliberately a development-only delivery mechanism.

Optional deterministic testing:

```text
OTP_FIXED=123456
```

Remove `OTP_FIXED` after testing to return to random OTPs.

## Iteration 2

Implement Amazon SES inside the OTP delivery layer. Keep the same API contract:

- `POST /api/auth/request-otp` with `{ "email": "user@example.com" }`
- `POST /api/auth/verify-otp` with `{ "email": "user@example.com", "otp": "123456" }`

The frontend and Todo APIs can remain unchanged.
