#!/usr/bin/env bash
# verify-supabase.sh — check that the visitor_responses table is locked down.
#
# Usage:
#   scripts/verify-supabase.sh <SUPABASE_URL> <PUBLISHABLE_KEY> [TABLE]
# Example:
#   scripts/verify-supabase.sh https://bgwaofspmqaxnhpsbwvy.supabase.co sb_publishable_xxx
#
# Needs only bash and curl. Uses the same public key the website uses, so it
# tests exactly what a stranger with that key could do.
#
# Checks:
#   0. Table exists (explains if supabase/schema.sql has not been run yet)
#   1. Insert a valid answer           -> must succeed (HTTP 201)
#   2. Read rows                       -> must return nothing
#   3. Update / delete rows            -> must change nothing
#   4. Insert bad data (role "robot", or an extra field) -> must be rejected
#
# NOTE: check 1 adds ONE real row with role 'provider' each time you run this
# (provider, not patient, so patient counts are not affected).
#
# Exit code: 0 if every check passes, 1 if any check fails.

set -u

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "Usage: $0 <SUPABASE_URL> <PUBLISHABLE_KEY> [TABLE]" >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but was not found." >&2
  exit 2
fi

BASE="${1%/}"
KEY="$2"
TABLE="${3:-visitor_responses}"
ENDPOINT="$BASE/rest/v1/$TABLE"

FAILS=0
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

# request METHOD URL [DATA] [EXTRA_HEADER]  -> sets CODE and BODY
request() {
  local method="$1" url="$2" data="${3:-}" extra="${4:-}"
  local args=(-sS -o "$BODY_FILE" -w '%{http_code}' --max-time 20 -X "$method"
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
  if [ -n "$data" ]; then args+=(-H "Content-Type: application/json" --data "$data"); fi
  if [ -n "$extra" ]; then args+=(-H "$extra"); fi
  CODE="$(curl "${args[@]}" "$url" 2>/dev/null)" || true
  [ -z "$CODE" ] && CODE="000"
  BODY="$(cat "$BODY_FILE" 2>/dev/null)"
}

# Collapse whitespace so '[ ]' or '[]\n' both count as empty.
trimmed() { printf '%s' "$1" | tr -d ' \t\r\n'; }
# Short one-line excerpt of a response body for the output.
excerpt() { printf '%s' "$1" | tr '\r\n' '  ' | cut -c1-160; }

pass() { printf 'PASS  %-34s HTTP %s  %s\n' "$1" "$2" "$3"; }
fail() { printf 'FAIL  %-34s HTTP %s  %s\n' "$1" "$2" "$3"; FAILS=$((FAILS + 1)); }

echo "Checking $ENDPOINT"
echo "(Check 1 inserts one test row with role 'provider', so patient counts are not affected.)"
echo

# ---- 0. Pre-check: does the table exist / is the project reachable? ----
request GET "$ENDPOINT?select=id&limit=0"
if [ "$CODE" = "000" ]; then
  fail "0. project reachable" "$CODE" "could not connect (wrong URL, no network, or project paused)"
  echo; echo "Result: FAIL (stopped early)"; exit 1
fi
if printf '%s' "$BODY" | grep -q 'PGRST205'; then
  fail "0. table exists" "$CODE" "table '$TABLE' not found (PGRST205): run supabase/schema.sql in the Supabase SQL Editor first"
  echo; echo "Result: FAIL (stopped early; nothing was inserted)"; exit 1
fi
if [ "$CODE" = "401" ] && printf '%s' "$BODY" | grep -qi 'api key\|apikey\|invalid'; then
  if ! printf '%s' "$BODY" | grep -q '42501'; then
    fail "0. key accepted" "$CODE" "key rejected: $(excerpt "$BODY")"
    echo; echo "Result: FAIL (stopped early)"; exit 1
  fi
fi
case "$CODE" in
  5??) fail "0. project healthy" "$CODE" "server error (project may be paused or restoring): $(excerpt "$BODY")"
       echo; echo "Result: FAIL (stopped early)"; exit 1 ;;
esac
pass "0. table exists" "$CODE" "table '$TABLE' is reachable"

# ---- 1. Valid insert ----
request POST "$ENDPOINT" '{"role":"provider"}' "Prefer: return=minimal"
if [ "$CODE" = "201" ]; then
  pass "1. insert valid row (provider)" "$CODE" "website can save an answer"
else
  fail "1. insert valid row (provider)" "$CODE" "expected 201: $(excerpt "$BODY")"
fi

# ---- 2. Select must return nothing ----
request GET "$ENDPOINT?select=*&limit=5"
case "$CODE" in
  401|403) pass "2. anon cannot read rows" "$CODE" "read blocked" ;;
  200|206)
    if [ "$(trimmed "$BODY")" = "[]" ]; then
      pass "2. anon cannot read rows" "$CODE" "returned [] (no rows visible)"
    else
      fail "2. anon cannot read rows" "$CODE" "ROWS ARE VISIBLE to the public key: $(excerpt "$BODY")"
    fi ;;
  *) fail "2. anon cannot read rows" "$CODE" "unexpected response: $(excerpt "$BODY")" ;;
esac

# ---- 3. Update / delete must change nothing ----
check_no_change() {
  local label="$1"
  case "$CODE" in
    401|403|404) pass "$label" "$CODE" "blocked" ;;
    200|204)
      if [ -z "$(trimmed "$BODY")" ] && [ "$CODE" = "204" ]; then
        # 204 with no body cannot prove 0 rows; we asked for representation.
        fail "$label" "$CODE" "no body returned, cannot confirm 0 rows changed"
      elif [ "$(trimmed "$BODY")" = "[]" ]; then
        pass "$label" "$CODE" "0 rows affected"
      else
        fail "$label" "$CODE" "ROWS WERE CHANGED: $(excerpt "$BODY")"
      fi ;;
    *) fail "$label" "$CODE" "unexpected response: $(excerpt "$BODY")" ;;
  esac
}
request PATCH "$ENDPOINT?role=eq.provider" '{"role":"patient"}' "Prefer: return=representation"
check_no_change "3a. anon cannot update rows"
request DELETE "$ENDPOINT?role=eq.provider" "" "Prefer: return=representation"
check_no_change "3b. anon cannot delete rows"

# ---- 4. Bad data must be rejected ----
request POST "$ENDPOINT" '{"role":"robot"}' "Prefer: return=minimal"
case "$CODE" in
  4??) pass "4a. reject role 'robot'" "$CODE" "rejected" ;;
  *)   fail "4a. reject role 'robot'" "$CODE" "expected 4xx: $(excerpt "$BODY")" ;;
esac
request POST "$ENDPOINT" '{"role":"provider","extra":1}' "Prefer: return=minimal"
case "$CODE" in
  4??) pass "4b. reject extra field" "$CODE" "rejected" ;;
  *)   fail "4b. reject extra field" "$CODE" "expected 4xx: $(excerpt "$BODY")" ;;
esac

echo
if [ "$FAILS" -gt 0 ]; then
  echo "Result: FAIL ($FAILS check(s) failed)"
  exit 1
fi
echo "Result: all checks passed"
exit 0
