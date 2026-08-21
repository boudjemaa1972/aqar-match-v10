#!/bin/bash
# The CRITICAL test: restart the dev server, then verify the rate limit
# is STILL enforced (proves the counter is persisted in the DB, not in
# the process memory). This is the test that distinguishes a real fix
# from the broken in-memory implementation.
set -e
cd /home/z/my-project

echo "=== Step A: Show current DB state (should still have count=20) ==="
node ./scripts/show-ratelimit.cjs

echo ""
echo "=== Step B: Kill dev server (simulates serverless instance restart) ==="
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "bun run dev" 2>/dev/null || true
sleep 3

# Verify port is no longer listening
if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
  echo "✗ Port 3000 still has a listener — kill failed"
  exit 1
else
  echo "✓ Port 3000 is now free (server is dead)"
fi

# CRITICAL: do NOT clear the DB. The whole point is to verify the
# counter persists across server restarts. If we cleared it, the test
# would be meaningless.
echo ""
echo "=== Step C: Verify DB still has the rate limit entry (NOT cleared) ==="
node ./scripts/show-ratelimit.cjs

echo ""
echo "=== Step D: Restart dev server (fresh process, empty in-memory state) ==="
setsid bun run dev < /dev/null > /tmp/dev.log 2>&1 &
disown
echo "Started dev server, waiting for ready..."

# Wait for server (up to 60s)
for i in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/; then
    echo "✓ Server ready after ${i}s"
    break
  fi
  sleep 1
done

if ! curl -s -o /dev/null --max-time 10 http://localhost:3000/; then
  echo "✗ Server failed to start"
  exit 1
fi

echo ""
echo "=== Step E: Send a NEW request from the SAME IP (should STILL be 429) ==="
echo "This is the critical test: the in-memory Map is empty (fresh process),"
echo "but the DB still has count=20, so the request must be blocked."
echo ""

# Send 3 requests to confirm the block persists
for i in 1 2 3; do
  CODE=$(curl -s -o /tmp/restart-resp-$i.json -w "%{http_code}" --max-time 15 \
    -H "x-forwarded-for: 198.51.100.42" \
    "http://localhost:3000/api/demand-estimate?intent=SELL&propertyType=APARTMENT&wilaya=test&askingPrice=1000000")
  printf "  Post-restart request %d: HTTP %s\n" "$i" "$CODE"
done

echo ""
echo "=== Step F: Show response body of post-restart request ==="
echo "Body: $(cat /tmp/restart-resp-1.json)"

echo ""
echo "=== Step G: Show DB state after the post-restart requests ==="
echo "(count should still be 20 — 429 responses don't increment the counter)"
node ./scripts/show-ratelimit.cjs

echo ""
echo "=== Step H: Sanity check — different IP should NOT be blocked ==="
CODE2=$(curl -s -o /tmp/diff-ip.json -w "%{http_code}" --max-time 15 \
  -H "x-forwarded-for: 203.0.113.99" \
  "http://localhost:3000/api/demand-estimate?intent=SELL&propertyType=APARTMENT&wilaya=test&askingPrice=1000000")
echo "Different IP request: HTTP $CODE2"
echo "Body: $(cat /tmp/diff-ip.json)"

echo ""
echo "=== SUMMARY ==="
echo "If you see 'Post-restart request 1: HTTP 429' above, the fix works:"
echo "the rate limit survives a server restart because it's stored in the DB."
