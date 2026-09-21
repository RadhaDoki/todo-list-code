# Todo DevOps Lab — Iteration 1

A realistic containerized Todo application for AWS DevOps training.

## Architecture

```text
Internet :80
   |
   v
Frontend container (React + Nginx)
   |
   | /api/*
   v
Backend container (Node.js + Express :3000)
   |
   v
PostgreSQL container (:5432)
```

No Docker Compose is used. Containers communicate through a Docker network.

## Authentication — Iteration 1

The user logs in with an email address and a 6-digit OTP.

For the first EC2/Jenkins deployment, external email delivery is intentionally disabled. OTP delivery is a development-only console mode:

- Secure random 6-digit OTP generation
- OTP hash stored in PostgreSQL using `pgcrypto`
- 5-minute expiry by default
- Maximum 5 verification attempts
- 60-second resend cooldown
- OTP consumed after successful verification
- JWT issued after verification
- OTP printed only in backend container logs

This keeps the first deployment independent of SNS/SMS/SES.

## Iteration 2

Amazon SES can replace the `deliverOtp()` function without changing the Todo APIs, database authentication flow, or frontend contract.

Do not use `OTP_DELIVERY_MODE=console` for a production application.

## Local/EC2 deployment

1. Copy `deploy/.env.example` to `.env`.
2. Set a strong `JWT_SECRET` and PostgreSQL password.
3. Keep `OTP_DELIVERY_MODE=console` for Iteration 1.
4. Run `deploy/deploy.sh`.

If you want deterministic lab testing, temporarily set `OTP_FIXED=123456`. Remove it when you want random OTPs.

## Jenkins

The Jenkins pipeline:

1. Checks out GitHub code.
2. Validates the project.
3. Builds backend and frontend Docker images on the Jenkins agent.
4. Copies source to EC2.
5. Runs `deploy/deploy.sh` on EC2.
6. Runs a health smoke test.

The EC2 `.env` is not stored in GitHub. It remains on the EC2 host.
