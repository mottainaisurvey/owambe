"""
Complete sponsors, speakers seeding and print final summary.
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

# Get existing sponsors
r = req("GET", f"/sponsors/event/{SUMMIT_ID}", token)
existing_sponsors = {s["name"] for s in r.json().get("sponsors", [])}
print(f"Existing sponsors: {list(existing_sponsors)}")

SPONSORS = [
    {"name": "Flutterwave", "tier": "GOLD", "amount": 2500000,
     "logoUrl": "https://placehold.co/200x80/FF6B35/white?text=Flutterwave",
     "contactEmail": "partnerships@flutterwave.com"},
    {"name": "MTN Nigeria", "tier": "PLATINUM", "amount": 5000000,
     "logoUrl": "https://placehold.co/200x80/FFCC00/black?text=MTN",
     "contactEmail": "sponsorship@mtn.ng"},
    {"name": "Paystack", "tier": "SILVER", "amount": 1000000,
     "logoUrl": "https://placehold.co/200x80/00C3F7/white?text=Paystack",
     "contactEmail": "hello@paystack.com"},
    {"name": "Andela", "tier": "BRONZE", "amount": 500000,
     "logoUrl": "https://placehold.co/200x80/6C3483/white?text=Andela",
     "contactEmail": "events@andela.com"},
    {"name": "TechPoint Africa", "tier": "BRONZE", "amount": 0,
     "logoUrl": "https://placehold.co/200x80/2C3E50/white?text=TechPoint",
     "contactEmail": "media@techpoint.africa"},
]

print("\nAdding sponsors...")
for sp in SPONSORS:
    if sp["name"] in existing_sponsors:
        print(f"  SKIP {sp['name']} (exists)")
        continue
    r = req("POST", f"/sponsors/event/{SUMMIT_ID}", token, sp)
    d = r.json()
    if d.get("success") or d.get("sponsor"):
        print(f"  OK   {sp['name']} ({sp['tier']}) — N{sp['amount']:,}")
    else:
        print(f"  FAIL {sp['name']}: {r.status_code} {d.get('error','?')}")
    time.sleep(0.5)

# Get existing speakers
r = req("GET", f"/speakers/event/{SUMMIT_ID}", token)
existing_speakers = {s["name"] for s in r.json().get("speakers", [])}
print(f"\nExisting speakers: {list(existing_speakers)}")

SPEAKERS = [
    {"name": "Dr. Ngozi Adeyemi", "title": "CEO, Flutterwave",
     "bio": "Pioneer of African fintech with 15+ years building payment infrastructure.",
     "topic": "The Future of African Fintech",
     "photoUrl": "https://i.pravatar.cc/300?img=1"},
    {"name": "Emeka Okafor", "title": "CTO, Andela",
     "bio": "Engineering leader who has scaled distributed teams across Africa.",
     "topic": "Scaling Engineering Teams in Africa",
     "photoUrl": "https://i.pravatar.cc/300?img=3"},
    {"name": "Amaka Nwosu", "title": "Partner, TLcom Capital",
     "bio": "Leading investor in African tech startups with 30+ portfolio companies.",
     "topic": "Raising Capital as an African Founder",
     "photoUrl": "https://i.pravatar.cc/300?img=5"},
    {"name": "Babatunde Fashola", "title": "Founder, PiggyVest",
     "bio": "Built Nigeria's leading savings platform from zero to 4 million users.",
     "topic": "Product-Market Fit in Emerging Markets",
     "photoUrl": "https://i.pravatar.cc/300?img=7"},
]

print("\nAdding speakers...")
for sp in SPEAKERS:
    if sp["name"] in existing_speakers:
        print(f"  SKIP {sp['name']} (exists)")
        continue
    r = req("POST", f"/speakers/event/{SUMMIT_ID}", token, sp)
    d = r.json()
    if d.get("success") or d.get("speaker"):
        print(f"  OK   {sp['name']} — {sp['topic']}")
    else:
        print(f"  FAIL {sp['name']}: {r.status_code} {d.get('error','?')}")
    time.sleep(0.5)

# Final summary
print("\n" + "=" * 55)
print("FINAL STATE SUMMARY")
print("=" * 55)

r = req("GET", "/analytics/planner/overview", token)
stats = r.json().get("stats", {})
print(f"\nAnalytics:")
print(f"  Total Events:    {stats.get('totalEvents', 0)}")
print(f"  Live Events:     {stats.get('liveEvents', 0)}")
print(f"  Total Attendees: {stats.get('totalAttendees', 0)}")
print(f"  Total Revenue:   N{stats.get('totalRevenue', 0):,}")
print(f"  Fill Rate:       {stats.get('fillRate', 0):.1f}%")

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

print("\nDone!")
