// Browser UX only; Supabase independently enforces server-side rate limits.
type Cooldown = { count: number; lastRequest: number; nextAllowed: number }
const RESET_AFTER = 30 * 60_000
const memory = new Map<string, Cooldown>()
const keyFor = (email: string) => `confirmation-cooldown:${email.trim().toLowerCase()}`

export function readConfirmationCooldown(email: string, now = Date.now()): Cooldown | null {
  const key = keyFor(email)
  let value = memory.get(key)
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null")
    if (stored && Number.isInteger(stored.count) && stored.count > 0
      && Number.isFinite(stored.lastRequest) && Number.isFinite(stored.nextAllowed)) {
      value = stored
    }
  } catch { /* Storage may be unavailable. Keep the in-memory countdown. */ }
  if (!value || now - value.lastRequest >= RESET_AFTER) return null
  return value
}

function save(email: string, value: Cooldown) {
  const key = keyFor(email)
  memory.set(key, value)
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* In-memory fallback. */ }
}

export function recordConfirmationSent(email: string, now = Date.now()) {
  const count = Math.min((readConfirmationCooldown(email, now)?.count ?? 0) + 1, 3)
  save(email, { count, lastRequest: now, nextAllowed: now + [60_000, 120_000, 300_000][count - 1] })
}

export function recordConfirmationRateLimit(email: string, now = Date.now()) {
  const previous = readConfirmationCooldown(email, now)
  save(email, {
    count: previous?.count ?? 1,
    lastRequest: now,
    nextAllowed: Math.max(previous?.nextAllowed ?? 0, now + 300_000),
  })
}

export function confirmationWaitSeconds(email: string, now = Date.now()) {
  return Math.max(0, Math.ceil(((readConfirmationCooldown(email, now)?.nextAllowed ?? now) - now) / 1000))
}
