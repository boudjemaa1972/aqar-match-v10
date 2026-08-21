#!/bin/bash
# Start dev server in background, then run rate limit test
set -e
cd /home/z/my-project

# Kill any existing servers
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "bun run dev" 2>/dev/null || true
sleep 2

# Clear cache
rm -rf .next

# Start dev server detached
setsid bun run dev < /dev/null > /tmp/dev.log 2>&1 &
DEV_PID=$!
disown

echo "Started dev server PID: $DEV_PID"

# Wait for server to be ready (up to 60s)
for i in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/; then
    echo "✓ Server ready after ${i}s"
    break
  fi
  sleep 1
done

# Final check
if ! curl -s -o /dev/null --max-time 10 http://localhost:3000/; then
  echo "✗ Server not ready"
  exit 1
fi

echo ""
echo "=== Clearing rate limit entries ==="
node ./scripts/clear-ratelimit.cjs

echo ""
echo "=== Sending 25 rapid requests from IP 198.51.100.42 ==="
echo "(Limit: 20 requests / 15 min — expect 429 from request 21)"
echo ""

for i in $(seq 1 25); do
  CODE=$(curl -s -o /tmp/resp-$i.json -w "%{http_code}" --max-time 15 \
    -H "x-forwarded-for: 198.51.100.42" \
    "http://localhost:3000/api/demand-estimate?intent=SELL&propertyType=APARTMENT&wilaya=test&askingPrice=1000000")
  printf "  Request %2d: HTTP %s\n" "$i" "$CODE"
done

echo ""
echo "=== Verifying server still alive ==="
curl -s -o /dev/null -w "Final home check: HTTP %{http_code}\n" --max-time 10 http://localhost:3000/

echo ""
echo "=== Response bodies of key requests ==="
echo "--- Request 20 (last allowed) ---"
cat /tmp/resp-20.json 2>/dev/null | head -c 200
echo ""
echo "--- Request 21 (first blocked) ---"
cat /tmp/resp-21.json 2>/dev/null
echo ""
echo "--- Request 25 ---"
cat /tmp/resp-25.json 2>/dev/null
echo ""

echo ""
echo "=== Current state of RateLimitEntry table ==="
cat > /tmp/show-ratelimit.cjs <<'EOF'
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
db.rateLimitEntry.findMany({ select: { id: true, count: true, resetAt: true } }).then((rows) => {
  console.log("Found " + rows.length + " rows:");
  for (const r of rows) {
    console.log("  id=" + r.id + " count=" + r.count + " resetAt=" + r.resetAt.toISOString());
  }
  return db.$disconnect();
}).catch((e) => { console.error(e); process.exit(1); });
EOF
cp /tmp/show-ratelimit.cjs ./scripts/show-ratelimit.cjs
node ./scripts/show-ratelimit.cjs
