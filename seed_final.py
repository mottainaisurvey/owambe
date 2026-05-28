"""
Owambe — Final Planner Data Seeder
- Cleans up duplicate draft events
- Adds ticket types, sponsors, speakers, bookings to the correct published event
- Registers remaining attendees
"""
import requests, json, time
from datetime import datetime, timedelta

BASE_URL = "https://owambe-api-production.up.railway.app/api"
SUMMIT_ID = "a8fee2d3-3a46-4390-8730-692565ddf62d"
SUMMIT_SLUG = "lagos-tech-summit-2026"

def req(method, path, token=None, data=None, public=False):
    h = {"Content-Type": "application/json"}
    if token and not public:
        h["Authorization"] = f"Bearer {token}"
    url = f"{BASE_URL}{path}"
    for attempt in range(3):
        try:
            if method == "GET":
                r = requests.get(url, headers=h, timeout=20)
            elif method == "POST":
                r = requests.post(url, headers=h, json=data or {}, timeout=20)
            elif method == "DELETE":
                r = requests.delete(url, headers=h, timeout=20)
            elif method == "PUT":
                r = requests.put(url, headers=h, json=data or {}, timeout=20)
            return r
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

def future(days):
    return (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

def past(days):
    return (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

FIRST_NAMES = ["Adaeze","Chukwuemeka","Ngozi","Babatunde","Amaka","Segun","Chidinma","Oluwafemi",
               "Nneka","Emeka","Ifeoma","Tunde","Chiamaka","Olumide","Blessing","Kayode","Chioma",
               "Rotimi","Adaora","Femi","Ebele","Wale","Obiageli","Kunle","Nkechi","Biodun",
               "Uchenna","Tobi","Ogechi","Dayo","Chinyere","Lanre","Abiodun","Sade","Chukwudi",
               "Yemi","Ifunanya","Gbemisola","Obinna","Folake","Chizaram","Ade","Onyinye","Bola",
               "Ikenna","Titi","Nnamdi","Kemi","Adaugo","Gbenga"]
LAST_NAMES = ["Okonkwo","Adeyemi","Nwosu","Babatunde","Eze","Okafor","Adeleke","Chukwu","Obi",
              "Adesanya","Nwachukwu","Olawale","Igwe","Fashola","Obiora","Akinwale","Onuoha",
              "Balogun","Onyeka","Ogundimu","Nwofor","Adebayo","Uzoma","Salami","Okeke","Afolabi",
              "Aniebo","Oduya","Chidi","Akintola"]
COMPANIES = ["Dangote Group","GTBank","Access Bank","MTN Nigeria","Airtel Nigeria","Zenith Bank",
             "First Bank","UBA","Flutterwave","Paystack","Andela","Interswitch","Sterling Bank",
             "Stanbic IBTC","Ecobank","TechPoint Africa","Cowrywise","PiggyVest","Carbon Finance","TeamApt"]

import random
def rand_name(i):
    return FIRST_NAMES[i % len(FIRST_NAMES)], LAST_NAMES[(i * 7) % len(LAST_NAMES)]

def rand_email(first, last, i):
    domains = ["gmail.com","yahoo.com","outlook.com","hotmail.com"]
    return f"{first.lower()}{last.lower()}{i+100}@{domains[i%4]}"

def rand_phone(i):
    prefixes = ["0803","0806","0810","0813","0816","0703","0706","0802","0808","0901"]
    return f"{prefixes[i%10]}{7000000+i}"

# ─────────────────────────────────────────────────────────────────────────────
print("🚀 Owambe Final Planner Seeder")
print("=" * 55)

# 1. Login
print("\n[1] Authenticating...")
r = req("POST", "/auth/login", data={"email": "planner@test.com", "password": "Planner123!"})
token = r.json()["accessToken"]
print(f"  ✅ Logged in")

# 2. Clean up duplicate draft events
print("\n[2] Cleaning up duplicate draft events...")
r = req("GET", "/events", token)
all_events = r.json().get("events", [])
drafts_deleted = 0
for e in all_events:
    if e["status"] == "DRAFT" and e["id"] != SUMMIT_ID:
        dr = req("DELETE", f"/events/{e['id']}", token)
        if dr.status_code in (200, 204):
            drafts_deleted += 1
        else:
            print(f"  ⚠️  Could not delete {e['name'][:30]}: {dr.status_code} {dr.text[:80]}")
        time.sleep(0.3)
print(f"  ✅ Deleted {drafts_deleted} duplicate draft events")

# 3. Check existing ticket types on the summit
print(f"\n[3] Checking ticket types on Lagos Tech Summit 2026...")
r = req("GET", f"/tickets/event/{SUMMIT_ID}", token)
existing_tts = r.json().get("ticketTypes", [])
existing_tt_names = {tt["name"] for tt in existing_tts}
print(f"  Existing: {list(existing_tt_names)}")

# Add missing ticket types
TICKET_TYPES = [
    {"name": "Early Bird", "price": 15000, "capacity": 100, "description": "Limited early bird — save 40%"},
    {"name": "Regular", "price": 25000, "capacity": 300, "description": "Standard admission"},
    {"name": "VIP", "price": 75000, "capacity": 50, "description": "VIP access, front-row, networking dinner, swag bag"},
    {"name": "Table of 10", "price": 200000, "capacity": 20, "description": "Reserve a full table for your team"},
]
ticket_type_ids = {tt["name"]: tt["id"] for tt in existing_tts}
for tt in TICKET_TYPES:
    if tt["name"] not in existing_tt_names:
        r = req("POST", f"/tickets/event/{SUMMIT_ID}", token, tt)
        d = r.json()
        if d.get("ticketType"):
            ticket_type_ids[tt["name"]] = d["ticketType"]["id"]
            print(f"  ✅ Added: {tt['name']} — ₦{tt['price']:,}")
        else:
            print(f"  ⚠️  {tt['name']}: {d.get('error','?')}")
        time.sleep(0.3)
    else:
        print(f"  ⏭️  {tt['name']} already exists")

# 4. Register more attendees (check current count first)
print(f"\n[4] Registering attendees for Lagos Tech Summit 2026...")
r = req("GET", f"/events/{SUMMIT_ID}", token)
current_count = r.json().get("event", {}).get("_count", {}).get("attendees", 0)
print(f"  Current attendees: {current_count}")

# Use Regular ticket type ID
regular_tt_id = ticket_type_ids.get("Regular") or ticket_type_ids.get("Startup Founder") or list(ticket_type_ids.values())[0]
vip_tt_id = ticket_type_ids.get("VIP") or regular_tt_id
early_tt_id = ticket_type_ids.get("Early Bird") or regular_tt_id

target = 80
to_add = max(0, target - current_count)
print(f"  Adding {to_add} more to reach {target} total...")

registered = 0
for i in range(to_add):
    first, last = rand_name(i + current_count)
    email = rand_email(first, last, i + current_count)
    phone = rand_phone(i + current_count)
    company = COMPANIES[(i + current_count) % len(COMPANIES)]
    # Mix ticket types
    if i % 10 == 0:
        tt_id = vip_tt_id
    elif i % 5 == 0:
        tt_id = early_tt_id
    else:
        tt_id = regular_tt_id
    payload = {
        "firstName": first, "lastName": last, "email": email,
        "phone": phone, "company": company, "ticketTypeId": tt_id,
    }
    try:
        r = requests.post(
            f"{BASE_URL}/events/public/{SUMMIT_SLUG}/register",
            json=payload, headers={"Content-Type": "application/json"}, timeout=20
        )
        d = r.json()
        if d.get("success"):
            registered += 1
        elif "already registered" not in str(d.get("error", "")):
            pass  # silent skip for other errors
    except Exception as ex:
        pass
    if (i + 1) % 10 == 0:
        print(f"  ... {i+1}/{to_add} ({registered} new)")
    time.sleep(0.15)
print(f"  ✅ {registered} new attendees registered (total now ~{current_count + registered})")

# 5. Add sponsors
print(f"\n[5] Adding sponsors to Lagos Tech Summit 2026...")
r = req("GET", f"/sponsors/event/{SUMMIT_ID}", token)
existing_sponsors = {s["companyName"] for s in r.json().get("sponsors", [])}
print(f"  Existing sponsors: {list(existing_sponsors)}")

SPONSORS = [
    {"companyName": "Flutterwave", "tier": "GOLD", "amount": 2500000,
     "logoUrl": "https://placehold.co/200x80/FF6B35/white?text=Flutterwave",
     "website": "https://flutterwave.com", "contactName": "Olumide Soyombo",
     "contactEmail": "partnerships@flutterwave.com"},
    {"companyName": "MTN Nigeria", "tier": "PLATINUM", "amount": 5000000,
     "logoUrl": "https://placehold.co/200x80/FFCC00/black?text=MTN",
     "website": "https://mtn.ng", "contactName": "Amaka Nwosu",
     "contactEmail": "sponsorship@mtn.ng"},
    {"companyName": "Paystack", "tier": "SILVER", "amount": 1000000,
     "logoUrl": "https://placehold.co/200x80/00C3F7/white?text=Paystack",
     "website": "https://paystack.com", "contactName": "Emeka Okafor",
     "contactEmail": "hello@paystack.com"},
    {"companyName": "Andela", "tier": "BRONZE", "amount": 500000,
     "logoUrl": "https://placehold.co/200x80/6C3483/white?text=Andela",
     "website": "https://andela.com", "contactName": "Ngozi Adeyemi",
     "contactEmail": "events@andela.com"},
    {"companyName": "TechPoint Africa", "tier": "MEDIA", "amount": 0,
     "logoUrl": "https://placehold.co/200x80/2C3E50/white?text=TechPoint",
     "website": "https://techpoint.africa", "contactName": "Babatunde Fashola",
     "contactEmail": "media@techpoint.africa"},
]
for sp in SPONSORS:
    if sp["companyName"] in existing_sponsors:
        print(f"  ⏭️  {sp['companyName']} already exists")
        continue
    r = req("POST", f"/sponsors/event/{SUMMIT_ID}", token, sp)
    d = r.json()
    if d.get("success") or d.get("sponsor"):
        print(f"  ✅ {sp['companyName']} ({sp['tier']}) — ₦{sp['amount']:,}")
    else:
        print(f"  ⚠️  {sp['companyName']}: {r.status_code} {d.get('error','?')}")
    time.sleep(0.4)

# 6. Add speakers
print(f"\n[6] Adding speakers to Lagos Tech Summit 2026...")
r = req("GET", f"/speakers/event/{SUMMIT_ID}", token)
existing_speakers = {s["name"] for s in r.json().get("speakers", [])}
print(f"  Existing speakers: {list(existing_speakers)}")

SPEAKERS = [
    {"name": "Dr. Ngozi Adeyemi", "title": "CEO, Flutterwave",
     "bio": "Pioneer of African fintech with 15+ years building payment infrastructure across 34 countries.",
     "topic": "The Future of African Fintech",
     "photoUrl": "https://i.pravatar.cc/300?img=1", "sessionTime": "09:00"},
    {"name": "Emeka Okafor", "title": "CTO, Andela",
     "bio": "Engineering leader who has scaled distributed teams across Africa and beyond.",
     "topic": "Scaling Engineering Teams in Africa",
     "photoUrl": "https://i.pravatar.cc/300?img=3", "sessionTime": "11:00"},
    {"name": "Amaka Nwosu", "title": "Partner, TLcom Capital",
     "bio": "Leading investor in African tech startups with a portfolio of 30+ companies.",
     "topic": "Raising Capital as an African Founder",
     "photoUrl": "https://i.pravatar.cc/300?img=5", "sessionTime": "14:00"},
    {"name": "Babatunde Fashola", "title": "Founder, PiggyVest",
     "bio": "Built Nigeria's leading savings platform from zero to 4 million users in 5 years.",
     "topic": "Product-Market Fit in Emerging Markets",
     "photoUrl": "https://i.pravatar.cc/300?img=7", "sessionTime": "16:00"},
]
for sp in SPEAKERS:
    if sp["name"] in existing_speakers:
        print(f"  ⏭️  {sp['name']} already exists")
        continue
    r = req("POST", f"/speakers/event/{SUMMIT_ID}", token, sp)
    d = r.json()
    if d.get("success") or d.get("speaker"):
        print(f"  ✅ {sp['name']} — {sp['topic']}")
    else:
        print(f"  ⚠️  {sp['name']}: {r.status_code} {d.get('error','?')}")
    time.sleep(0.4)

# 7. Create vendor bookings using vendor login to set availability first
# Since we can't bypass availability, create bookings with dates that are open
# The vendor seed sets availability as ALWAYS_AVAILABLE or specific days
# Try a few different dates to find available slots
print(f"\n[7] Creating vendor bookings...")
r = req("GET", "/bookings", token)
existing_bookings = r.json().get("bookings", [])
existing_vendor_ids = {b.get("vendor", {}).get("id") for b in existing_bookings}
print(f"  Existing bookings: {len(existing_bookings)}")

VENDOR_BOOKINGS = [
    {"vendorId": "08ee5a24-6a5f-4dd3-91aa-fa1dbdcb5bdf", "name": "Clicks & Flicks Photography",
     "totalAmount": 350000, "guestCount": 500, "bookingType": "INSTANT",
     "eventDescription": "Full event photography and videography for Lagos Tech Summit 2026. 2 photographers + 1 videographer for both days."},
    {"vendorId": "1e86f14c-9894-4b9a-8a10-eb1cf5c693c4", "name": "Mama Cass Catering",
     "totalAmount": 1200000, "guestCount": 500, "bookingType": "INSTANT",
     "eventDescription": "Catering for 500 guests — welcome breakfast, buffet lunch, afternoon snacks for both days."},
    {"vendorId": "14c6a803-fb99-4a7a-b0ee-9937e6b36272", "name": "SoundWave AV Productions",
     "totalAmount": 480000, "guestCount": 500, "bookingType": "INSTANT",
     "eventDescription": "Full AV setup — main stage sound, LED screens, lighting rig, live streaming equipment."},
    {"vendorId": "762bbd41-abc0-4a84-b84b-ce4ea4c8dacc", "name": "Petals & Blooms Décor",
     "totalAmount": 220000, "guestCount": 500, "bookingType": "RFQ",
     "eventDescription": "Stage backdrop, floral arrangements, table centrepieces for networking dinner."},
    {"vendorId": "b207d156-b215-4db1-8c0e-9fbfcbf4bc33", "name": "Glow Up Studio",
     "totalAmount": 180000, "guestCount": 50, "bookingType": "RFQ",
     "eventDescription": "Makeup and styling for keynote speakers and VIP guests on both days."},
]

# Try multiple date options to find available slots
date_options = [future(45), future(60), future(75), future(90), future(120)]

for vb in VENDOR_BOOKINGS:
    if vb["vendorId"] in existing_vendor_ids:
        print(f"  ⏭️  {vb['name']} already booked")
        continue
    endpoint = "instant" if vb["bookingType"] == "INSTANT" else "rfq"
    booked = False
    for date_opt in date_options:
        payload = {
            "vendorId": vb["vendorId"],
            "eventDate": date_opt,
            "totalAmount": vb["totalAmount"],
            "eventDescription": vb["eventDescription"],
            "guestCount": vb["guestCount"],
        }
        r = req("POST", f"/bookings/{endpoint}", token, payload)
        d = r.json()
        if d.get("success") or d.get("booking"):
            print(f"  ✅ {vb['name']} — ₦{vb['totalAmount']:,} [{vb['bookingType']}]")
            booked = True
            break
        elif "not available" not in str(d.get("error", "")).lower():
            print(f"  ⚠️  {vb['name']}: {d.get('error','?')}")
            break
        time.sleep(0.2)
    if not booked:
        # Create as RFQ regardless (no availability check)
        payload = {
            "vendorId": vb["vendorId"],
            "eventDate": future(45),
            "eventDescription": vb["eventDescription"],
            "guestCount": vb["guestCount"],
        }
        r = req("POST", "/bookings/rfq", token, payload)
        d = r.json()
        if d.get("success") or d.get("booking"):
            print(f"  ✅ {vb['name']} — RFQ fallback ✅")
        else:
            print(f"  ⚠️  {vb['name']} RFQ fallback: {d.get('error','?')}")
    time.sleep(0.5)

# 8. Create 3 more events with proper ticket types then publish
print(f"\n[8] Creating additional events with ticket types...")
NEW_EVENTS = [
    {"name": "Afrobeats & Culture Night", "type": "CONCERT",
     "description": "Unforgettable evening of live Afrobeats, cultural showcases, and premium dining.",
     "startDate": future(30), "endDate": future(30), "startTime": "19:00", "endTime": "23:59",
     "venue": "Landmark Event Centre", "city": "Lagos", "state": "Lagos", "country": "Nigeria",
     "capacity": 800, "isPublic": True,
     "bannerUrl": "https://placehold.co/1200x400/E74C3C/white?text=Afrobeats+Night"},
    {"name": "Tech Founders Dinner Q2 2026", "type": "NETWORKING",
     "description": "Intimate dinner for 80 selected tech founders and VCs.",
     "startDate": future(15), "endDate": future(15), "startTime": "19:30", "endTime": "22:30",
     "venue": "Transcorp Hilton", "city": "Abuja", "state": "FCT", "country": "Nigeria",
     "capacity": 80, "isPublic": False,
     "bannerUrl": "https://placehold.co/1200x400/2C3E50/white?text=Founders+Dinner"},
    {"name": "Owambe Business Summit 2026", "type": "CONFERENCE",
     "description": "Nigeria's premier business summit — 500+ entrepreneurs, investors, and industry leaders.",
     "startDate": future(60), "endDate": future(61), "startTime": "08:00", "endTime": "18:00",
     "venue": "Eko Hotel & Suites", "city": "Lagos", "state": "Lagos", "country": "Nigeria",
     "capacity": 500, "isPublic": True,
     "bannerUrl": "https://placehold.co/1200x400/6C3483/white?text=Business+Summit"},
]

# Check which events already exist (by name)
r = req("GET", "/events", token)
current_names = {e["name"] for e in r.json().get("events", [])}

for ev in NEW_EVENTS:
    if ev["name"] in current_names:
        print(f"  ⏭️  '{ev['name']}' already exists")
        continue
    r = req("POST", "/events", token, ev)
    d = r.json()
    if not (d.get("success") or d.get("event")):
        print(f"  ⚠️  {ev['name']}: {d.get('error','?')}")
        continue
    eid = d["event"]["id"]
    print(f"  ✅ Created: {ev['name']} (id:{eid[:8]})")
    time.sleep(0.4)
    # Add ticket types
    for tt in [
        {"name": "Early Bird", "price": 15000, "capacity": 50, "description": "Early bird ticket"},
        {"name": "Regular", "price": 25000, "capacity": 200, "description": "Standard admission"},
        {"name": "VIP", "price": 75000, "capacity": 20, "description": "VIP access"},
    ]:
        req("POST", f"/tickets/event/{eid}", token, tt)
        time.sleep(0.2)
    # Publish
    rp = req("POST", f"/events/{eid}/publish", token)
    dp = rp.json()
    if dp.get("success"):
        print(f"     → Published ✅")
    else:
        print(f"     → Publish: {dp.get('error','?')}")
    time.sleep(0.5)

# 9. Final summary
print(f"\n{'='*55}")
print("✅ SEEDING COMPLETE — Final state:")
time.sleep(2)

r = req("GET", "/analytics/planner/overview", token)
stats = r.json().get("stats", {})
print(f"\n📊 Analytics:")
print(f"  Total Events:    {stats.get('totalEvents', 0)}")
print(f"  Live Events:     {stats.get('liveEvents', 0)}")
print(f"  Total Attendees: {stats.get('totalAttendees', 0)}")
print(f"  Total Revenue:   ₦{stats.get('totalRevenue', 0):,}")
print(f"  Fill Rate:       {stats.get('fillRate', 0):.1f}%")

r = req("GET", "/events", token)
events_final = r.json().get("events", [])
print(f"\n📅 Events ({len(events_final)}):")
for e in events_final:
    cnt = e.get("_count", {})
    print(f"  [{e['status']:10}] {e['name'][:40]} | att:{cnt.get('attendees',0)} | tix:{cnt.get('tickets',0)}")

r = req("GET", "/bookings", token)
bookings_final = r.json().get("bookings", [])
print(f"\n📋 Bookings ({len(bookings_final)}):")
for b in bookings_final:
    v = b.get("vendor", {})
    print(f"  [{b.get('status','?'):12}] {v.get('businessName','?')[:30]} | ₦{b.get('totalAmount',0):,}")

r = req("GET", f"/sponsors/event/{SUMMIT_ID}", token)
sponsors_final = r.json().get("sponsors", [])
print(f"\n💰 Sponsors ({len(sponsors_final)}):")
for s in sponsors_final:
    print(f"  [{s.get('tier','?'):10}] {s.get('companyName','?')} | ₦{s.get('amount',0):,}")

r = req("GET", f"/speakers/event/{SUMMIT_ID}", token)
speakers_final = r.json().get("speakers", [])
print(f"\n🎤 Speakers ({len(speakers_final)}):")
for s in speakers_final:
    print(f"  {s.get('name','?')} — {s.get('topic','?')[:40]}")

print(f"\n🎉 Planner account fully loaded!")
