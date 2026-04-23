#!/bin/bash
set -e

# Start PocketBase in background
rm -rf /Users/rusty/pb_test/auxiliary.db /Users/rusty/pb_test/data.db
mkdir -p /Users/rusty/pb_test
xattr -c /tmp/pocketbase

# 1. Create superuser (CLI doesn't need running server for this... need to check)
# Actually let's just start PB, create via API

/tmp/pocketbase serve --dir=/Users/rusty/pb_test --http=127.0.0.1:8090 &
PB_PID=$!
sleep 2

echo "=== PocketBase running at http://127.0.0.1:8090 ==="

# 2. Create first admin via install endpoint
curl -s -X POST http://127.0.0.1:8090/api/admins \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123456","passwordConfirm":"test123456"}'; echo

# Or try the superuser endpoint
# PocketBase v0.37 might need the _superusers collection

echo "=== Admin created, creating collections ==="

# 3. Get admin token
TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/_superusers/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"test@test.com","password":"test123456"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
  TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/admins/auth-with-password \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test123456"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Could not authenticate"
  kill $PB_PID
  exit 1
fi

echo "Authenticated. Token: ${TOKEN:0:20}..."

AUTH="Authorization: Bearer $TOKEN"

# 4. Create collections
curl -s -X POST http://127.0.0.1:8090/api/collections \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"products","type":"base","schema":[{"name":"slug","type":"text","required":true},{"name":"name","type":"text","required":true},{"name":"description","type":"text"},{"name":"price","type":"number"},{"name":"images","type":"json"},{"name":"variants","type":"json"},{"name":"options","type":"json"},{"name":"inventory","type":"json"},{"name":"seo","type":"json"},{"name":"metadata","type":"json"},{"name":"subscription","type":"json"},{"name":"status","type":"select","options":{"values":["draft","active","archived"]}}]}'
echo ""

curl -s -X POST http://127.0.0.1:8090/api/collections \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"orders","type":"base","schema":[{"name":"email","type":"text","required":true},{"name":"status","type":"select","options":{"values":["pending","confirmed","paid","fulfilled","shipped","delivered","cancelled","refunded"]}},{"name":"paymentStatus","type":"select","options":{"values":["pending","authorized","paid","partially_refunded","refunded","failed"]}},{"name":"fulfillmentStatus","type":"select","options":{"values":["unfulfilled","partially_fulfilled","fulfilled","returned"]}},{"name":"items","type":"json"},{"name":"subtotal","type":"number"},{"name":"totalTax","type":"number"},{"name":"totalShipping","type":"number"},{"name":"total","type":"number"},{"name":"currency","type":"text"},{"name":"shippingAddress","type":"json"},{"name":"billingAddress","type":"json"},{"name":"transactions","type":"json"},{"name":"notes","type":"text"},{"name":"metadata","type":"json"}]}'
echo ""

curl -s -X POST http://127.0.0.1:8090/api/collections \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"carts","type":"base","schema":[{"name":"sessionId","type":"text","required":true},{"name":"customerId","type":"text"},{"name":"items","type":"json"},{"name":"subtotal","type":"number"},{"name":"totalTax","type":"number"},{"name":"totalShipping","type":"number"},{"name":"totalDiscount","type":"number"},{"name":"total","type":"number"},{"name":"currency","type":"text"},{"name":"metadata","type":"json"}]}'
echo ""

curl -s -X POST http://127.0.0.1:8090/api/collections \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"customers","type":"base","schema":[{"name":"email","type":"text","required":true},{"name":"firstName","type":"text"},{"name":"lastName","type":"text"},{"name":"phone","type":"text"},{"name":"addresses","type":"json"},{"name":"defaultAddressId","type":"text"},{"name":"metadata","type":"json"}]}'
echo ""

echo "=== Seeding products ==="

curl -s -X POST http://127.0.0.1:8090/api/collections/products/records \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"slug":"test-shirt","name":"Test Shirt","description":"A comfortable test shirt","price":1999,"status":"active","images":[{"url":"https://via.placeholder.com/400x400","alt":"Test Shirt"}],"inventory":{"quantity":100,"available":100,"allowOutOfStock":false}}'
echo ""

curl -s -X POST http://127.0.0.1:8090/api/collections/products/records \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"slug":"test-mug","name":"Test Mug","description":"Ceramic mug","price":1299,"status":"active","images":[{"url":"https://via.placeholder.com/400x400","alt":"Test Mug"}],"inventory":{"quantity":50,"available":50,"allowOutOfStock":false}}'
echo ""

echo "=== Seeding order ==="

curl -s -X POST http://127.0.0.1:8090/api/collections/orders/records \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"email":"test@example.com","status":"paid","paymentStatus":"paid","fulfillmentStatus":"unfulfilled","items":[{"productId":"unknown","name":"Test Shirt","sku":"test-shirt","price":1999,"quantity":1,"total":1999}],"subtotal":1999,"total":1999,"currency":"USD","transactions":[],"notes":""}'
echo ""

echo "READY: PocketBase setup complete"
echo "Admin: http://127.0.0.1:8090/_/ (test@test.com / test123456)"

# Keep PB running
wait $PB_PID
