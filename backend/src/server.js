import express from "express";
import cors from "cors";
import crypto from "crypto";
import { query } from "./db.js";
import { authMiddleware, signToken } from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const otpTtlMinutes = Number(process.env.OTP_TTL_MINUTES || 5);
const maxOtpAttempts = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const resendCooldownSeconds = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);

app.use(cors());
app.use(express.json({ limit: "100kb" }));

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function generateOtp() {
  if (process.env.OTP_FIXED) return process.env.OTP_FIXED;
  return String(crypto.randomInt(100000, 1000000));
}

function deliverOtp(email, otp) {
  // Iteration 1: no external email/SMS provider is required.
  // Keep delivery configurable so SES can replace this function in Iteration 2.
  if (process.env.OTP_DELIVERY_MODE !== "console") {
    throw new Error("OTP_DELIVERY_MODE must be 'console' for Iteration 1");
  }

  console.log(`[DEV OTP] ${email}: ${otp}`);
}

app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", database: "ok" });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.post("/api/auth/request-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }

    const recent = await query(
      `SELECT COUNT(*)::int AS count
         FROM otp_codes
        WHERE email = $1
          AND created_at > NOW() - ($2 || ' seconds')::interval`,
      [email, resendCooldownSeconds]
    );

    if (recent.rows[0].count >= 1) {
      return res.status(429).json({
        error: `Please wait at least ${resendCooldownSeconds} seconds before requesting another OTP`
      });
    }

    const otp = generateOtp();

    await query(
      `INSERT INTO otp_codes
        (email, otp_hash, expires_at, attempts)
       VALUES
        ($1, crypt($2, gen_salt('bf')), NOW() + ($3 || ' minutes')::interval, 0)`,
      [email, otp, otpTtlMinutes]
    );

    deliverOtp(email, otp);

    res.json({
      message: "OTP generated successfully. Check the backend logs for the development OTP."
    });
  } catch (error) {
    console.error("OTP generation failed:", error);
    res.status(500).json({ error: "Unable to generate OTP" });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || "");

    if (!isValidEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: "Invalid email address or OTP" });
    }

    const result = await query(
      `SELECT id, otp_hash, attempts
         FROM otp_codes
        WHERE email = $1
          AND expires_at > NOW()
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid or expired OTP" });
    }

    const otpRow = result.rows[0];

    if (otpRow.attempts >= maxOtpAttempts) {
      return res.status(429).json({
        error: "Maximum OTP attempts exceeded. Request a new OTP."
      });
    }

    const match = await query(
      `SELECT crypt($1, otp_hash) = otp_hash AS valid
         FROM otp_codes
        WHERE id = $2`,
      [otp, otpRow.id]
    );

    if (!match.rows[0].valid) {
      await query(
        "UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1",
        [otpRow.id]
      );

      return res.status(401).json({ error: "Invalid or expired OTP" });
    }

    await query(
      "UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1",
      [otpRow.id]
    );

    const userResult = await query(
      `INSERT INTO users (email)
       VALUES ($1)
       ON CONFLICT (email)
       DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email`,
      [email]
    );

    const token = signToken(userResult.rows[0]);

    res.json({
      token,
      user: userResult.rows[0]
    });
  } catch (error) {
    console.error("OTP verification failed:", error);
    res.status(500).json({ error: "Unable to verify OTP" });
  }
});

app.get("/api/lists", authMiddleware, async (req, res) => {
  const result = await query(
    `SELECT id, name, created_at
       FROM todo_lists
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [req.user.sub]
  );

  res.json(result.rows);
});

app.post("/api/lists", authMiddleware, async (req, res) => {
  const name = String(req.body.name || "").trim();

  if (!name || name.length > 100) {
    return res.status(400).json({ error: "List name is required and must be <= 100 chars" });
  }

  const result = await query(
    `INSERT INTO todo_lists (user_id, name)
     VALUES ($1, $2)
     RETURNING id, name, created_at`,
    [req.user.sub, name]
  );

  res.status(201).json(result.rows[0]);
});

app.delete("/api/lists/:id", authMiddleware, async (req, res) => {
  const result = await query(
    `DELETE FROM todo_lists
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [req.params.id, req.user.sub]
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "List not found" });
  res.status(204).send();
});

app.get("/api/lists/:listId/todos", authMiddleware, async (req, res) => {
  const result = await query(
    `SELECT t.id, t.title, t.completed, t.created_at, t.updated_at
       FROM todos t
       JOIN todo_lists l ON l.id = t.list_id
      WHERE t.list_id = $1 AND l.user_id = $2
      ORDER BY t.created_at DESC`,
    [req.params.listId, req.user.sub]
  );

  res.json(result.rows);
});

app.post("/api/lists/:listId/todos", authMiddleware, async (req, res) => {
  const title = String(req.body.title || "").trim();

  if (!title || title.length > 500) {
    return res.status(400).json({ error: "Todo title is required and must be <= 500 chars" });
  }

  const listCheck = await query(
    "SELECT id FROM todo_lists WHERE id = $1 AND user_id = $2",
    [req.params.listId, req.user.sub]
  );

  if (listCheck.rowCount === 0) return res.status(404).json({ error: "List not found" });

  const result = await query(
    `INSERT INTO todos (list_id, title)
     VALUES ($1, $2)
     RETURNING id, title, completed, created_at, updated_at`,
    [req.params.listId, title]
  );

  res.status(201).json(result.rows[0]);
});

app.put("/api/todos/:id", authMiddleware, async (req, res) => {
  const title = String(req.body.title || "").trim();
  const completed = Boolean(req.body.completed);

  if (!title || title.length > 500) {
    return res.status(400).json({ error: "Todo title is required and must be <= 500 chars" });
  }

  const result = await query(
    `UPDATE todos t
        SET title = $1, completed = $2, updated_at = NOW()
       FROM todo_lists l
      WHERE t.id = $3
        AND t.list_id = l.id
        AND l.user_id = $4
      RETURNING t.id, t.title, t.completed, t.created_at, t.updated_at`,
    [title, completed, req.params.id, req.user.sub]
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "Todo not found" });
  res.json(result.rows[0]);
});

app.delete("/api/todos/:id", authMiddleware, async (req, res) => {
  const result = await query(
    `DELETE FROM todos t
      USING todo_lists l
      WHERE t.id = $1
        AND t.list_id = l.id
        AND l.user_id = $2
      RETURNING t.id`,
    [req.params.id, req.user.sub]
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "Todo not found" });
  res.status(204).send();
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
