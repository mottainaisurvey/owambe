"""
Cancel zero-amount duplicate bookings and show final clean state.
"""
import requests, json, time
from collections import defaultdict

BASE_URL = "https://owambe-api-production.up.railway.app/api"
SUMMIT_ID = "a8fee2d3-3a46-4390-8730-692565ddf62d"

r = requests.post(f"{BASE_URL}/auth/login",
    json={"email": "planner@test.com", "password": "Planner123!"}, timeout=20)
token = r.json()["accessToken"]
H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
print("Logged in OK")

r = requests.get(f"{BASE_URL}/bookings", headers=H, timeout=20)
bookings = r.json().get("bookings", [])
print(f"Total bookings before cleanup: {len(bookings)}")

# Group by vendor, keep the one with highest amount
vendor_groups = defaultdict(list)
for b in bookings:
    vname = b.get("vendor", {}).get("businessName", "unknown")
    vendor_groups[vname].append(b)

cancelled = 0
for vname, group in vendor_groups.items():
    if len(group) <= 1:
        continue
    # Sort by amount desc, keep first
    group.sort(key=lambda x: float(x.get("totalAmount", 0)), reverse=True)
    keep = group[0]
    for b in group[1:]:
        # Cancel it
        r = requests.post(
            f"{BASE_URL}/bookings/{b['id']}/cancel",
            headers=H, json={"reason": "Duplicate booking — cleanup"},
            timeout=20
        )
        if r.status_code in (200, 201):
            cancelled += 1
            print(f"  Cancelled: {vname[:30]} id:{b['id'][:8]} (N{int(float(b.get('totalAmount',0))):,})")
        else:
            print(f"  FAIL cancel {b['id'][:8]}: {r.status_code} {r.text[:100]}")
        time.sleep(0.4)

print(f"\nCancelled {cancelled} duplicate bookings")

# Final state
print("\n" + "=" * 60)
print("FINAL PLANNER ACCOUNT STATE")
print("=" * 60)

r = requests.get(f"{BASE_URL}/analytics/planner/overview", headers=H, timeout=20)
stats = r.json().get("stats", {})
print(f"\nDashboard Analytics:")
print(f"  Total Events:    {stats.get('totalEvents', 0)}")
print(f"  Total Attendees: {stats.get('totalAttendees', 0)}")
print(f"  Total Revenue:   N{stats.get('totalRevenue', 0):,}")
print(f"  Fill Rate:       {stats.get('fillRate', 0):.1f}%")

r = requests.get(f"{BASE_URL}/events", headers=H, timeout=20)
events_final = r.json().get("events", [])
print(f"\nEvents ({len(events_final)}):")
for e in events_final:
    cnt = e.get("_count", {})
    print(f"  [{e['status']:10}] {e['name'][:50]} | att:{cnt.get('attendees',0)}")

r = requests.get(f"{BASE_URL}/bookings", headers=H, timeout=20)
bookings_final = r.json().get("bookings", [])
active = [b for b in bookings_final if b.get("status") != "CANCELLED"]
print(f"\nActive Bookings ({len(active)}):")
for b in active:
    v = b.get("vendor", {})
    amt = b.get("totalAmount", 0)
    print(f"  [{b.get('status','?'):12}] {v.get('businessName','?')[:35]} | N{int(float(amt)):,}")

r = requests.get(f"{BASE_URL}/sponsors/event/{SUMMIT_ID}", headers=H, timeout=20)
sponsors_final = r.json().get("sponsors", [])
print(f"\nSponsors ({len(sponsors_final)}) — Lagos Tech Summit 2026:")
for s in sponsors_final:
    print(f"  [{s.get('tier','?'):10}] {s.get('name','?')} | N{int(float(s.get('amount',0))):,}")

r = requests.get(f"{BASE_URL}/speakers/event/{SUMMIT_ID}", headers=H, timeout=20)
speakers_final = r.json().get("speakers", [])
print(f"\nSpeakers ({len(speakers_final)}) — Lagos Tech Summit 2026:")
for s in speakers_final:
    print(f"  {s.get('name','?')} | {s.get('title','?')} | {s.get('topic','?')[:40]}")

print("\n" + "=" * 60)
print("Planner test account fully loaded and clean!")
print("=" * 60)
