"""
Diagnose and fix the planner test data seeding issues.
"""
import requests
import json
import time

BASE_URL = "https://owambe-api-production.up.railway.app/api"

def req(method, path, token=None, data=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    url = f"{BASE_URL}{path}"
    for attempt in range(3):
        try:
            if method == "GET":
                r = requests.get(url, headers=h, timeout=20)
            elif method == "POST":
                r = requests.post(url, headers=h, json=data or {}, timeout=20)
            elif method == "PUT":
                r = requests.put(url, headers=h, json=data or {}, timeout=20)
            return r
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(2)

# Login
print("Logging in...")
r = req("POST", "/auth/login", data={"email": "planner@test.com", "password": "Planner123!"})
d = r.json()
token = d["accessToken"]
print(f"  OK: {d['user']['firstName']} {d['user']['lastName']}")

# Check events
print("\n=== Events ===")
r = req("GET", "/events", token)
events = r.json().get("events", [])
for e in events:
    cnt = e.get("_count", {})
    print(f"  [{e['status']:10}] {e['name'][:45]} | id:{e['id'][:8]} | attendees:{cnt.get('attendees',0)} | tickets:{cnt.get('tickets',0)}")

# Find the main summit
summit = next((e for e in events if "Lagos Tech Summit" in e["name"]), None)
if not summit:
    print("ERROR: Lagos Tech Summit not found!")
    exit(1)

summit_id = summit["id"]
summit_slug = summit.get("slug", "lagos-tech-summit-2026")
print(f"\nMain event: {summit['name']} [{summit['status']}] slug:{summit_slug}")

# Check ticket types on summit
print("\n=== Ticket Types on Summit ===")
r = req("GET", f"/tickets/event/{summit_id}", token)
tts = r.json().get("ticketTypes", [])
for tt in tts:
    print(f"  {tt['name']} | ₦{tt['price']:,} | cap:{tt['capacity']} | id:{tt['id'][:8]}")

# Try public registration with a test attendee
print("\n=== Testing Public Registration ===")
if tts:
    tt_id = tts[0]["id"]
    test_payload = {
        "firstName": "Test",
        "lastName": "Attendee",
        "email": "test.attendee.unique99@gmail.com",
        "phone": "08031234567",
        "company": "Test Corp",
        "ticketTypeId": tt_id,
    }
    r = requests.post(
        f"{BASE_URL}/events/public/{summit_slug}/register",
        json=test_payload,
        headers={"Content-Type": "application/json"},
        timeout=20
    )
    print(f"  Status: {r.status_code}")
    print(f"  Response: {json.dumps(r.json(), indent=2)[:300]}")
else:
    print("  No ticket types found — cannot test registration")

# Check vendor availability for one vendor
print("\n=== Vendor Availability Check (Photography) ===")
r = req("GET", "/vendors/08ee5a24-6a5f-4dd3-91aa-fa1dbdcb5bdf/availability", token)
print(f"  Status: {r.status_code}")
print(f"  Response: {json.dumps(r.json(), indent=2)[:400]}")

# Check sponsors endpoint
print("\n=== Sponsors Endpoint Test ===")
r = req("GET", f"/sponsors/event/{summit_id}", token)
print(f"  Status: {r.status_code}")
print(f"  Response: {json.dumps(r.json(), indent=2)[:300]}")

# Check bookings
print("\n=== Existing Bookings ===")
r = req("GET", "/bookings", token)
bookings = r.json().get("bookings", [])
print(f"  Total: {len(bookings)}")
for b in bookings:
    vendor = b.get("vendor", {})
    print(f"  [{b['status']:10}] {vendor.get('businessName','?')[:30]} | ₦{b.get('totalAmount',0):,}")
