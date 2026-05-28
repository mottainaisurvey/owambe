"""
Owambe — Planner Test Data Seeder
Seeds the planner@test.com account with realistic test data across all features.
"""

import requests
import json
import random
import time
from datetime import datetime, timedelta
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://owambe-api-production.up.railway.app/api"

# ── Resilient session with retry ──────────────────────────────────────────────
def make_session():
    s = requests.Session()
    retry = Retry(
        total=4,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s

SESSION = make_session()

def api_get(url, headers):
    for attempt in range(3):
        try:
            return SESSION.get(url, headers=headers, timeout=20)
        except Exception as e:
            if attempt == 2: raise
            time.sleep(2 ** attempt)

def api_post(url, headers, json_data):
    for attempt in range(3):
        try:
            return SESSION.post(url, headers=headers, json=json_data, timeout=20)
        except Exception as e:
            if attempt == 2: raise
            time.sleep(2 ** attempt)

# ── Auth ──────────────────────────────────────────────────────────────────────
def login(email, password):
    r = api_post(f"{BASE_URL}/auth/login", {"Content-Type": "application/json"}, {"email": email, "password": password})
    d = r.json()
    if not d.get("success"):
        raise Exception(f"Login failed: {d}")
    return d["accessToken"], d["user"]

def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# ── Helpers ───────────────────────────────────────────────────────────────────
def future_date(days_from_now):
    return (datetime.utcnow() + timedelta(days=days_from_now)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

def past_date(days_ago):
    return (datetime.utcnow() - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

NIGERIAN_FIRST_NAMES = [
    "Adaeze", "Chukwuemeka", "Ngozi", "Babatunde", "Amaka", "Segun",
    "Chidinma", "Oluwafemi", "Nneka", "Emeka", "Ifeoma", "Tunde",
    "Chiamaka", "Olumide", "Blessing", "Kayode", "Chioma", "Rotimi",
    "Adaora", "Femi", "Ebele", "Wale", "Obiageli", "Kunle",
    "Nkechi", "Biodun", "Uchenna", "Tobi", "Ogechi", "Dayo",
    "Chinyere", "Lanre", "Abiodun", "Sade", "Chukwudi", "Yemi",
    "Ifunanya", "Gbemisola", "Obinna", "Folake", "Chizaram", "Ade",
    "Onyinye", "Bola", "Ikenna", "Titi", "Nnamdi", "Kemi",
    "Adaugo", "Gbenga"
]

NIGERIAN_LAST_NAMES = [
    "Okonkwo", "Adeyemi", "Nwosu", "Babatunde", "Eze", "Okafor",
    "Adeleke", "Chukwu", "Obi", "Adesanya", "Nwachukwu", "Olawale",
    "Igwe", "Fashola", "Obiora", "Akinwale", "Onuoha", "Balogun",
    "Onyeka", "Ogundimu", "Nwofor", "Adebayo", "Uzoma", "Salami",
    "Okeke", "Afolabi", "Aniebo", "Oduya", "Chidi", "Akintola"
]

COMPANIES = [
    "Dangote Group", "GTBank", "Access Bank", "MTN Nigeria", "Airtel Nigeria",
    "Zenith Bank", "First Bank", "UBA", "Flutterwave", "Paystack",
    "Andela", "Interswitch", "Sterling Bank", "Stanbic IBTC", "Ecobank",
    "TechPoint Africa", "Cowrywise", "PiggyVest", "Carbon Finance", "TeamApt"
]

TICKET_TYPES_DATA = [
    {"name": "Early Bird", "price": 15000, "capacity": 100, "description": "Limited early bird tickets — save 40%"},
    {"name": "Regular", "price": 25000, "capacity": 300, "description": "Standard admission ticket"},
    {"name": "VIP", "price": 75000, "capacity": 50, "description": "VIP access with front-row seating, networking dinner, and exclusive swag bag"},
    {"name": "Table of 10", "price": 200000, "capacity": 20, "description": "Reserve a full table for your team — includes 10 regular tickets"},
]

VENDOR_IDS = {
    "PHOTOGRAPHY_VIDEO": "08ee5a24-6a5f-4dd3-91aa-fa1dbdcb5bdf",
    "MAKEUP_ARTIST":     "b207d156-b215-4db1-8c0e-9fbfcbf4bc33",
    "CATERING":          "1e86f14c-9894-4b9a-8a10-eb1cf5c693c4",
    "VENUE":             "868d4dac-53b5-4261-8ff2-4ec7d7a0e963",
    "DECOR_FLORALS":     "762bbd41-abc0-4a84-b84b-ce4ea4c8dacc",
    "SPEAKER":           "7fc8bf2a-13f3-4197-a813-c5a484c05060",
    "CATERING_2":        "b7c9131c-028a-4232-b2a9-f688ca488481",
    "AV_PRODUCTION":     "14c6a803-fb99-4a7a-b0ee-9937e6b36272",
}

SPONSORS_DATA = [
    {"companyName": "Flutterwave", "tier": "GOLD", "amount": 2500000, "logoUrl": "https://placehold.co/200x80/FF6B35/white?text=Flutterwave", "website": "https://flutterwave.com"},
    {"companyName": "MTN Nigeria", "tier": "PLATINUM", "amount": 5000000, "logoUrl": "https://placehold.co/200x80/FFCC00/black?text=MTN", "website": "https://mtn.ng"},
    {"companyName": "Paystack", "tier": "SILVER", "amount": 1000000, "logoUrl": "https://placehold.co/200x80/00C3F7/white?text=Paystack", "website": "https://paystack.com"},
    {"companyName": "Andela", "tier": "BRONZE", "amount": 500000, "logoUrl": "https://placehold.co/200x80/6C3483/white?text=Andela", "website": "https://andela.com"},
    {"companyName": "TechPoint Africa", "tier": "MEDIA", "amount": 0, "logoUrl": "https://placehold.co/200x80/2C3E50/white?text=TechPoint", "website": "https://techpoint.africa"},
]

SPEAKERS_DATA = [
    {"name": "Dr. Ngozi Adeyemi", "title": "CEO, Flutterwave", "bio": "Pioneer of African fintech with 15+ years experience building payment infrastructure across 34 countries.", "topic": "The Future of African Fintech", "photoUrl": "https://i.pravatar.cc/300?img=1"},
    {"name": "Emeka Okafor", "title": "CTO, Andela", "bio": "Engineering leader who has scaled distributed engineering teams across Africa and beyond.", "topic": "Scaling Engineering Teams in Africa", "photoUrl": "https://i.pravatar.cc/300?img=3"},
    {"name": "Amaka Nwosu", "title": "Partner, TLcom Capital", "bio": "Leading investor in African tech startups with a portfolio of 30+ companies.", "topic": "Raising Capital as an African Founder", "photoUrl": "https://i.pravatar.cc/300?img=5"},
    {"name": "Babatunde Fashola", "title": "Founder, PiggyVest", "bio": "Built Nigeria's leading savings platform from zero to 4 million users in 5 years.", "topic": "Product-Market Fit in Emerging Markets", "photoUrl": "https://i.pravatar.cc/300?img=7"},
]

EVENTS_TO_CREATE = [
    {
        "name": "Owambe Business Summit 2026",
        "type": "CONFERENCE",
        "description": "Nigeria's premier business summit bringing together 500+ entrepreneurs, investors, and industry leaders for two days of networking, workshops, and keynote sessions.",
        "startDate": future_date(45),
        "endDate": future_date(46),
        "startTime": "08:00",
        "endTime": "18:00",
        "venue": "Eko Hotel & Suites",
        "city": "Lagos",
        "state": "Lagos",
        "country": "Nigeria",
        "capacity": 500,
        "isPublic": True,
        "bannerUrl": "https://placehold.co/1200x400/6C3483/white?text=Owambe+Business+Summit+2026",
        "status_target": "LIVE",  # We'll publish this one
    },
    {
        "name": "Afrobeats & Culture Night",
        "type": "CONCERT",
        "description": "An unforgettable evening of live Afrobeats performances, cultural showcases, and premium dining experience at the heart of Lagos.",
        "startDate": future_date(30),
        "endDate": future_date(30),
        "startTime": "19:00",
        "endTime": "23:59",
        "venue": "Landmark Event Centre",
        "city": "Lagos",
        "state": "Lagos",
        "country": "Nigeria",
        "capacity": 800,
        "isPublic": True,
        "bannerUrl": "https://placehold.co/1200x400/E74C3C/white?text=Afrobeats+%26+Culture+Night",
        "status_target": "PUBLISHED",
    },
    {
        "name": "Tech Founders Dinner — Q2 2026",
        "type": "NETWORKING",
        "description": "Intimate dinner for 80 selected tech founders and VCs. Curated conversations, deal flow, and connections that matter.",
        "startDate": future_date(15),
        "endDate": future_date(15),
        "startTime": "19:30",
        "endTime": "22:30",
        "venue": "Transcorp Hilton",
        "city": "Abuja",
        "state": "FCT",
        "country": "Nigeria",
        "capacity": 80,
        "isPublic": False,
        "bannerUrl": "https://placehold.co/1200x400/2C3E50/white?text=Tech+Founders+Dinner",
        "status_target": "PUBLISHED",
    },
    {
        "name": "Lagos Startup Pitch Day",
        "type": "CONFERENCE",
        "description": "10 selected startups pitch to a panel of 15 investors. Open to the public for inspiration and networking.",
        "startDate": past_date(10),
        "endDate": past_date(10),
        "startTime": "10:00",
        "endTime": "17:00",
        "venue": "Co-Creation Hub",
        "city": "Lagos",
        "state": "Lagos",
        "country": "Nigeria",
        "capacity": 200,
        "isPublic": True,
        "bannerUrl": "https://placehold.co/1200x400/27AE60/white?text=Lagos+Startup+Pitch+Day",
        "status_target": "PUBLISHED",  # Past event
    },
]

def rand_name():
    return random.choice(NIGERIAN_FIRST_NAMES), random.choice(NIGERIAN_LAST_NAMES)

def rand_email(first, last, i):
    domains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"]
    return f"{first.lower()}.{last.lower()}{i}@{random.choice(domains)}"

def rand_phone():
    prefixes = ["0803", "0806", "0810", "0813", "0816", "0703", "0706", "0802", "0808", "0901"]
    return f"{random.choice(prefixes)}{random.randint(1000000, 9999999)}"

# ── Main seeding logic ────────────────────────────────────────────────────────
def main():
    print("🚀 Owambe Planner Test Data Seeder")
    print("=" * 50)

    # Login
    print("\n[1/7] Authenticating as planner...")
    token, user = login("planner@test.com", "Planner123!")
    H = headers(token)
    print(f"  ✅ Logged in as {user['firstName']} {user['lastName']} ({user['role']})")

    # Get existing event
    existing = api_get(f"{BASE_URL}/events", H).json()
    existing_events = existing.get("events", [])
    summit_id = existing_events[0]["id"] if existing_events else None
    print(f"\n[2/7] Existing events: {len(existing_events)}")
    if summit_id:
        print(f"  - Lagos Tech Summit 2026 (ID: {summit_id[:8]}...)")

    # ── Create ticket types for existing event ────────────────────────────────
    print(f"\n[3/7] Creating ticket types for Lagos Tech Summit 2026...")
    ticket_type_ids = []
    for tt in TICKET_TYPES_DATA:
        r = api_post(f"{BASE_URL}/tickets/event/{summit_id}", H, tt)
        d = r.json()
        if d.get("success") or d.get("ticketType"):
            tid = d.get("ticketType", {}).get("id", "")
            ticket_type_ids.append(tid)
            print(f"  ✅ {tt['name']} — ₦{tt['price']:,} (cap: {tt['capacity']})")
        else:
            print(f"  ⚠️  {tt['name']}: {d.get('error','unknown error')}")
        time.sleep(0.3)

    # ── Register attendees for existing event ─────────────────────────────────
    print(f"\n[4/7] Registering 47 attendees for Lagos Tech Summit 2026...")
    # Get the event slug
    event_detail = api_get(f"{BASE_URL}/events/{summit_id}", H).json()
    event_slug = event_detail.get("event", {}).get("slug", "lagos-tech-summit-2026")

    registered = 0
    for i in range(47):
        first, last = rand_name()
        email = rand_email(first, last, i)
        phone = rand_phone()
        company = random.choice(COMPANIES)
        # Use Regular ticket type if available, else first
        tt_id = ticket_type_ids[1] if len(ticket_type_ids) > 1 else (ticket_type_ids[0] if ticket_type_ids else None)
        if not tt_id:
            continue
        payload = {
            "firstName": first,
            "lastName": last,
            "email": email,
            "phone": phone,
            "company": company,
            "ticketTypeId": tt_id,
        }
        try:
            r = api_post(f"{BASE_URL}/events/public/{event_slug}/register", {"Content-Type": "application/json"}, payload)
            d = r.json()
            if d.get("success"):
                registered += 1
        except Exception as ex:
            print(f"  ⚠️  Attendee {i+1} failed: {ex}")
        if (i + 1) % 10 == 0:
            print(f"  ... {i+1}/47 processed ({registered} successful)")
        time.sleep(0.2)  # gentle rate limiting

    print(f"  ✅ {registered}/47 attendees registered")

    # ── Create additional events ───────────────────────────────────────────────
    print(f"\n[5/7] Creating 4 additional events...")
    created_event_ids = [summit_id]
    for ev_data in EVENTS_TO_CREATE:
        status_target = ev_data.pop("status_target", "PUBLISHED")
        try:
            r = api_post(f"{BASE_URL}/events", H, ev_data)
            d = r.json()
        except Exception as ex:
            print(f"  ⚠️  {ev_data.get('name','?')}: {ex}")
            continue
        if d.get("success") or d.get("event"):
            eid = d.get("event", {}).get("id", "")
            ename = ev_data["name"]
            created_event_ids.append(eid)
            print(f"  ✅ Created: {ename} (ID: {eid[:8]}...)")
            time.sleep(0.5)
            # Publish it
            if status_target in ("PUBLISHED", "LIVE"):
                rp = api_post(f"{BASE_URL}/events/{eid}/publish", H, {})
                dp = rp.json()
                if dp.get("success"):
                    print(f"     → Published ✅")
                else:
                    print(f"     → Publish: {dp.get('error','?')}")
            # Add ticket types to new events
            for tt in TICKET_TYPES_DATA[:2]:  # Just Early Bird + Regular for new events
                api_post(f"{BASE_URL}/tickets/event/{eid}", H, tt)
                time.sleep(0.2)
        else:
            print(f"  ⚠️  {ev_data['name']}: {d.get('error','unknown')}")
        time.sleep(0.5)

    # ── Create vendor bookings ─────────────────────────────────────────────────
    print(f"\n[6/7] Creating vendor bookings for Lagos Tech Summit 2026...")
    bookings_config = [
        {
            "vendorId": VENDOR_IDS["PHOTOGRAPHY_VIDEO"],
            "eventDate": future_date(45),
            "totalAmount": 350000,
            "eventDescription": "Full event photography and videography coverage for Lagos Tech Summit 2026. Need 2 photographers and 1 videographer for both days.",
            "guestCount": 500,
            "bookingType": "INSTANT",
        },
        {
            "vendorId": VENDOR_IDS["CATERING"],
            "eventDate": future_date(45),
            "totalAmount": 1200000,
            "eventDescription": "Catering for 500 guests — welcome breakfast, buffet lunch, and afternoon snacks for both days of the summit.",
            "guestCount": 500,
            "bookingType": "INSTANT",
        },
        {
            "vendorId": VENDOR_IDS["AV_PRODUCTION"],
            "eventDate": future_date(45),
            "totalAmount": 480000,
            "eventDescription": "Full AV setup — main stage sound system, LED screens, lighting rig, and live streaming equipment for 2-day conference.",
            "guestCount": 500,
            "bookingType": "INSTANT",
        },
        {
            "vendorId": VENDOR_IDS["DECOR_FLORALS"],
            "eventDate": future_date(45),
            "totalAmount": 220000,
            "eventDescription": "Stage backdrop, floral arrangements for entrance and registration desk, table centrepieces for networking dinner.",
            "guestCount": 500,
            "bookingType": "INSTANT",
        },
        {
            "vendorId": VENDOR_IDS["CATERING_2"],
            "eventDate": future_date(30),
            "totalAmount": 800000,
            "eventDescription": "Premium catering for Afrobeats & Culture Night — cocktail reception, live food stations, and dessert bar for 800 guests.",
            "guestCount": 800,
            "bookingType": "INSTANT",
        },
        {
            "vendorId": VENDOR_IDS["VENUE"],
            "eventDate": future_date(15),
            "totalAmount": 950000,
            "eventDescription": "Private dining room hire for Tech Founders Dinner — 80 guests, 3-course meal, AV setup, and dedicated event coordinator.",
            "guestCount": 80,
            "bookingType": "RFQ",
        },
    ]

    booking_ids = []
    for bc in bookings_config:
        btype = bc.pop("bookingType", "INSTANT")
        endpoint = "instant" if btype == "INSTANT" else "rfq"
        try:
            r = api_post(f"{BASE_URL}/bookings/{endpoint}", H, bc)
            d = r.json()
        except Exception as ex:
            print(f"  ⚠️  Booking error: {ex}")
            continue
        if d.get("success") or d.get("booking"):
            bid = d.get("booking", {}).get("id", "")
            booking_ids.append(bid)
            vendor_amount = bc.get("totalAmount", 0)
            print(f"  ✅ {btype} booking — ₦{vendor_amount:,} (ID: {bid[:8]}...)")
        else:
            print(f"  ⚠️  Booking failed: {d.get('error','unknown')} | {json.dumps(bc)[:80]}")
        time.sleep(0.5)

    # ── Add sponsors ───────────────────────────────────────────────────────────
    print(f"\n[7/7] Adding sponsors to Lagos Tech Summit 2026...")
    for sp in SPONSORS_DATA:
        try:
            r = api_post(f"{BASE_URL}/sponsors/event/{summit_id}", H, sp)
            d = r.json()
        except Exception as ex:
            print(f"  ⚠️  {sp['companyName']}: {ex}")
            continue
        if d.get("success") or d.get("sponsor"):
            print(f"  ✅ {sp['companyName']} ({sp['tier']}) — ₦{sp['amount']:,}")
        else:
            print(f"  ⚠️  {sp['companyName']}: {d.get('error','unknown')}")
        time.sleep(0.3)

    # ── Add speakers ───────────────────────────────────────────────────────────
    print(f"\n[+] Adding speakers to Lagos Tech Summit 2026...")
    for sp in SPEAKERS_DATA:
        try:
            r = api_post(f"{BASE_URL}/speakers/event/{summit_id}", H, sp)
            d = r.json()
        except Exception as ex:
            print(f"  ⚠️  {sp['name']}: {ex}")
            continue
        if d.get("success") or d.get("speaker"):
            print(f"  ✅ {sp['name']} — {sp['topic']}")
        else:
            print(f"  ⚠️  {sp['name']}: {d.get('error','unknown')}")
        time.sleep(0.3)

    # ── Final summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 50)
    print("✅ SEEDING COMPLETE — Final state check...")
    time.sleep(2)

    # Re-fetch analytics
    analytics = api_get(f"{BASE_URL}/analytics/planner/overview", H).json()
    stats = analytics.get("stats", {})
    print(f"\n📊 Planner Analytics Overview:")
    print(f"  Total Events:     {stats.get('totalEvents', 0)}")
    print(f"  Live Events:      {stats.get('liveEvents', 0)}")
    print(f"  Total Attendees:  {stats.get('totalAttendees', 0)}")
    print(f"  Total Revenue:    ₦{stats.get('totalRevenue', 0):,}")
    print(f"  Fill Rate:        {stats.get('fillRate', 0):.1f}%")

    events_final = api_get(f"{BASE_URL}/events", H).json()
    print(f"\n📅 Events ({len(events_final.get('events', []))}):")
    for e in events_final.get("events", []):
        cnt = e.get("_count", {})
        print(f"  - {e['name']} [{e['status']}] | {cnt.get('attendees',0)} attendees | {cnt.get('tickets',0)} ticket types")

    bookings_final = api_get(f"{BASE_URL}/bookings", H).json()
    print(f"\n📋 Bookings: {len(bookings_final.get('bookings', []))}")
    for b in bookings_final.get("bookings", []):
        print(f"  - {b.get('vendor',{}).get('businessName','?')} | {b.get('status')} | ₦{b.get('totalAmount',0):,}")

    print("\n🎉 Planner account is fully loaded with test data!")

if __name__ == "__main__":
    main()
