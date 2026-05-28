"""
Clean up duplicate bookings, sponsors, and speakers.
Keep only the best (highest amount) entry for each vendor/sponsor/speaker.
"""
import requests, json, time

BASE_URL = "https://owambe-api-production.up.railway.app/api"
SUMMIT_ID = "a8fee2d3-3a46-4390-8730-692565ddf62d"

def req(method, path, token=None, data=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    url = f"{BASE_URL}{path}"
    for attempt in range(3):
        try:
            if method == "GET":
                return requests.get(url, headers=h, timeout=20)
            elif method == "POST":
                return requests.post(url, headers=h, json=data or {}, timeout=20)
            elif method == "DELETE":
                return requests.delete(url, headers=h, timeout=20)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

# Login
print("Authenticating...")
r = req("POST", "/auth/login", data={"email": "planner@test.com", "password": "Planner123!"})
token = r.json()["accessToken"]
print("  OK")

# ─── Clean up duplicate bookings ───────────────────────────────────────────
print("\nCleaning duplicate bookings...")
r = req("GET", "/bookings", token)
bookings = r.json().get("bookings", [])

# Group by vendor name, keep the one with highest totalAmount (non-zero preferred)
from collections import defaultdict
vendor_groups = defaultdict(list)
for b in bookings:
    vname = b.get("vendor", {}).get("businessName", "unknown")
    vendor_groups[vname].append(b)

to_delete_bookings = []
for vname, group in vendor_groups.items():
    if len(group) <= 1:
        continue
    # Sort: prefer non-zero amount, then by createdAt descending (keep newest with amount)
    group.sort(key=lambda x: (float(x.get("totalAmount", 0)), x.get("createdAt", "")), reverse=True)
    keep = group[0]
    delete_rest = group[1:]
    print(f"  {vname}: keeping id={keep['id'][:8]} (N{int(float(keep.get('totalAmount',0))):,}), deleting {len(delete_rest)}")
    to_delete_bookings.extend([b["id"] for b in delete_rest])

deleted_b = 0
for bid in to_delete_bookings:
    r = req("DELETE", f"/bookings/{bid}", token)
    if r.status_code in (200, 204):
        deleted_b += 1
    time.sleep(0.3)
print(f"  Deleted {deleted_b} duplicate bookings")

# ─── Clean up duplicate sponsors ───────────────────────────────────────────
print("\nCleaning duplicate sponsors...")
r = req("GET", f"/sponsors/event/{SUMMIT_ID}", token)
sponsors = r.json().get("sponsors", [])

sponsor_groups = defaultdict(list)
for s in sponsors:
    sponsor_groups[s["name"]].append(s)

to_delete_sponsors = []
for sname, group in sponsor_groups.items():
    if len(group) <= 1:
        continue
    group.sort(key=lambda x: (float(x.get("amount", 0)), x.get("createdAt", "")), reverse=True)
    keep = group[0]
    delete_rest = group[1:]
    print(f"  {sname}: keeping id={keep['id'][:8]}, deleting {len(delete_rest)}")
    to_delete_sponsors.extend([s["id"] for s in delete_rest])

deleted_s = 0
for sid in to_delete_sponsors:
    r = req("DELETE", f"/sponsors/{sid}", token)
    if r.status_code in (200, 204):
        deleted_s += 1
    time.sleep(0.3)
print(f"  Deleted {deleted_s} duplicate sponsors")

# ─── Clean up duplicate speakers ───────────────────────────────────────────
print("\nCleaning duplicate speakers...")
r = req("GET", f"/speakers/event/{SUMMIT_ID}", token)
speakers = r.json().get("speakers", [])

speaker_groups = defaultdict(list)
for s in speakers:
    speaker_groups[s["name"]].append(s)

to_delete_speakers = []
for sname, group in speaker_groups.items():
    if len(group) <= 1:
        continue
    group.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    keep = group[0]
    delete_rest = group[1:]
    print(f"  {sname}: keeping id={keep['id'][:8]}, deleting {len(delete_rest)}")
    to_delete_speakers.extend([s["id"] for s in delete_rest])

deleted_sp = 0
for spid in to_delete_speakers:
    r = req("DELETE", f"/speakers/{spid}", token)
    if r.status_code in (200, 204):
        deleted_sp += 1
    time.sleep(0.3)
print(f"  Deleted {deleted_sp} duplicate speakers")

# ─── Add MTN Nigeria (the one that kept failing) ───────────────────────────
print("\nAdding MTN Nigeria sponsor (retry)...")
r = req("GET", f"/sponsors/event/{SUMMIT_ID}", token)
existing = {s["name"] for s in r.json().get("sponsors", [])}
if "MTN Nigeria" not in existing:
    r = req("POST", f"/sponsors/event/{SUMMIT_ID}", token, {
        "name": "MTN Nigeria", "tier": "PLATINUM", "amount": 5000000,
        "logoUrl": "https://placehold.co/200x80/FFCC00/black?text=MTN",
        "contactEmail": "sponsorship@mtn.ng"
    })
    d = r.json()
    if d.get("success") or d.get("sponsor"):
        print("  OK   MTN Nigeria (PLATINUM) — N5,000,000")
    else:
        print(f"  FAIL {r.status_code}: {d.get('error','?')}")
else:
    print("  MTN Nigeria already exists")

# ─── Final clean summary ───────────────────────────────────────────────────
print("\n" + "=" * 55)
print("CLEAN FINAL STATE")
print("=" * 55)

r = req("GET", "/analytics/planner/overview", token)
stats = r.json().get("stats", {})
print(f"\nAnalytics:")
print(f"  Total Events:    {stats.get('totalEvents', 0)}")
print(f"  Total Attendees: {stats.get('totalAttendees', 0)}")
print(f"  Total Revenue:   N{stats.get('totalRevenue', 0):,}")

r = req("GET", "/events", token)
events_final = r.json().get("events", [])
print(f"\nEvents ({len(events_final)}):")
for e in events_final:
    cnt = e.get("_count", {})
    print(f"  [{e['status']:10}] {e['name'][:45]} | att:{cnt.get('attendees',0)}")

r = req("GET", "/bookings", token)
bookings_final = r.json().get("bookings", [])
print(f"\nBookings ({len(bookings_final)}):")
for b in bookings_final:
    v = b.get("vendor", {})
    amt = b.get("totalAmount", 0)
    print(f"  [{b.get('status','?'):12}] {v.get('businessName','?')[:30]} | N{int(float(amt)):,}")

r = req("GET", f"/sponsors/event/{SUMMIT_ID}", token)
sponsors_final = r.json().get("sponsors", [])
print(f"\nSponsors ({len(sponsors_final)}):")
for s in sponsors_final:
    print(f"  [{s.get('tier','?'):10}] {s.get('name','?')} | N{int(float(s.get('amount',0))):,}")

r = req("GET", f"/speakers/event/{SUMMIT_ID}", token)
speakers_final = r.json().get("speakers", [])
print(f"\nSpeakers ({len(speakers_final)}):")
for s in speakers_final:
    print(f"  {s.get('name','?')} — {s.get('topic','?')[:40]}")

print("\nAll clean!")
