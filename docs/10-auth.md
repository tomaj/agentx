# 10 — Auth & Authorization

## Platform user auth

Vlastná implementácia (Passport + JWT, argon2id pre heslá). Dôvod: plná kontrola, žiadna externá závislosť.

### Registrácia

- Email + password
- Validácia: RFC-5322 email, password min 10 chars, zxcvbn skóre ≥ 3
- `password_hash` = argon2id(password, { memory 64MB, iterations 3 })
- (Neskôr) email verifikácia

### Login

- Credentials check
- Issue:
  - **Access token** (JWT, HS256, 15 min expiry) — payload: `{ sub: userId, orgId?, roles[] }`
  - **Refresh token** (opaque random 32 bytes, 30 dní expiry) — stored hashed v DB tabuľke `refresh_tokens`
- Client uloží oba:
  - Access: in-memory + httpOnly cookie (pre SSR)
  - Refresh: httpOnly, secure, sameSite=strict cookie

### Refresh flow

- `POST /auth/refresh` s refresh token cookie
- API overí (lookup + compare hashed), rotuje (starý mark revoked, nový issue), vracia nový access + refresh

### Logout

- `POST /auth/logout` → refresh token marknutý `revoked_at`, vyčistí cookies

### Passport strategies

- `JwtStrategy` — access token validation (env JWT_SECRET)
- `LocalStrategy` — login endpoint
- (Neskôr) `OAuth2Strategy` pre "Sign in with Google/GitHub" — provider-level, oddelené od MCP OAuth

## Authorization (authz)

### Model

- `users` ↔ `org_members` ↔ `orgs`, role = `owner` / `admin` / `member`
- Resources (agents, mcp_credentials, triggers, executions) patria `org` (v multi-tenant móde) alebo `user` (single-user MVP)

### Policy check pravidlá (MVP)

| Resource | Action | Kto |
|---|---|---|
| agent | create | org member |
| agent | read | org member |
| agent | update / delete | created_by ∨ org admin+ |
| mcp_credential | create | org member (pre seba) |
| mcp_credential | read | owner only (decrypt len pre owner) |
| mcp_credential | delete | owner ∨ org admin+ |
| api_key | create / revoke | org admin+ |
| run | read | org member |
| run | cancel | creator ∨ org admin+ |

NestJS `@Guards`, policy objects v každom module.

## API key auth (pre HTTP triggery)

### Formát

Kľúč = `agx_<prefix>_<secret>` kde:
- `prefix` = 8 znakov, hex, user-visible pre UI a lookup
- `secret` = 32 bytes base64url

### Uloženie

- `hashed_key` = SHA-256(secret) — HMAC by bolo lepšie, ale pre jednoduchosť SHA-256 stačí (secret je už 256-bit)
- Plaintext sa **zobrazí iba raz** pri create, potom stratený (musí si uložiť user)

### Overenie

```
1. Extract prefix + secret z header X-API-Key
2. SELECT * FROM api_keys WHERE prefix = $1 AND revoked_at IS NULL
3. constant-time compare SHA-256(secret) s hashed_key
4. UPDATE last_used_at
```

### Scope

API key je bound na:
- `trigger_id` (najužší scope — kľúč slúži len na spustenie konkrétneho triggera) — **odporúčaný default**
- alebo `org_id` (wider, pre programatický prístup do celej org)

## Encryption at rest

### Master key

- `AGENTX_MASTER_KEY` env var — 32 bytes, base64
- Loaded pri štarte, nikdy na disku (okrem `.env`, ktoré je gitignore)
- V prod: z secret manageru (AWS Secrets Manager / HashiCorp Vault / Doppler)

### Encryption primitiv

- **libsodium `crypto_secretbox`** (XSalsa20 + Poly1305) alebo **AES-256-GCM**
- Per-field: `encrypt(plaintext, masterKey) -> nonce || ciphertext || tag`
- Stored ako `bytea` v PG

### Key rotation (phase 2)

- Nové keys → všetky ciphertexty prepísané (background job)
- `master_key_id` pole by umožnilo multi-key support

## CSRF

- Cookie-based session: CSRF token cez `csurf` middleware pre state-changing routes
- API key routes: exempt (authorizácia je v kľúči, nie v cookie)

## Rate limiting

- Per-IP na auth routes (5 pokusov za 15 min) — blokuje brute force
- Per-API-key na triggery (konfigurovateľné per key, default 60/min)
- Implementácia: Redis token bucket, NestJS interceptor

## Audit events

Zapíš do `audit_log`:
- user login / logout / failed login
- user created / updated / deleted
- api key created / revoked
- mcp credential created / deleted / disconnected
- agent created / updated / deleted / archived
- trigger enabled / disabled
