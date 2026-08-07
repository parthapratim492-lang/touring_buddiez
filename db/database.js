const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// DATA_DIR (set via env var in production) points the database at a
// persistent disk mount instead of the app folder — see server.js for why.
// Falls back to this file's own folder for local development.
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'touring_buddiez.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    route TEXT,
    duration TEXT,
    group_size TEXT,
    vehicle TEXT,
    price TEXT,
    image_path TEXT,
    description TEXT,
    itinerary TEXT DEFAULT '[]',
    inclusions TEXT DEFAULT '[]',
    exclusions TEXT DEFAULT '[]',
    highlights TEXT DEFAULT '[]',
    route_stops TEXT DEFAULT '[]',
    featured INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    seats TEXT,
    tags TEXT DEFAULT '[]',
    image_path TEXT,
    whatsapp TEXT,
    display_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path TEXT NOT NULL,
    alt_text TEXT,
    is_tall INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    package_name TEXT,
    quote TEXT,
    rating INTEGER DEFAULT 5,
    display_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    email TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    package_slug TEXT,
    package_name TEXT,
    travel_date TEXT,
    group_size TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    message TEXT,
    source TEXT DEFAULT 'contact_form',
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Lightweight migration (for DBs created before status/email/created_at existed) ──
(function migrateTestimonials() {
  const cols = db.prepare(`PRAGMA table_info(testimonials)`).all().map(c => c.name);
  if (!cols.includes('status')) db.exec(`ALTER TABLE testimonials ADD COLUMN status TEXT DEFAULT 'pending'`);
  if (!cols.includes('email')) db.exec(`ALTER TABLE testimonials ADD COLUMN email TEXT`);
  if (!cols.includes('created_at')) db.exec(`ALTER TABLE testimonials ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`);
})();

// ─── Lightweight migration (for DBs created before route_stops existed) ──────
(function migratePackages() {
  const cols = db.prepare(`PRAGMA table_info(packages)`).all().map(c => c.name);
  if (!cols.includes('route_stops')) db.exec(`ALTER TABLE packages ADD COLUMN route_stops TEXT DEFAULT '[]'`);
  if (!cols.includes('price')) db.exec(`ALTER TABLE packages ADD COLUMN price TEXT`);

  // Backfill route stops for the 5 built-in destinations on databases that
  // already existed before this feature shipped (seed() only inserts rows
  // when the table is empty, so upgraders wouldn't otherwise get this data).
  const backfill = {
    meghalaya: [
      { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Airport / railway station pickup.' },
      { day: 1, name: 'Shillong', lat: 25.5788, lng: 91.8933, note: "Police Bazar & Ward's Lake." },
      { day: 2, name: 'Cherrapunji', lat: 25.2702, lng: 91.7323, note: 'Nohkalikai Falls, Mawsmai Cave, living root bridges.' },
      { day: 3, name: 'Dawki', lat: 25.1966, lng: 92.0202, note: 'Boat ride on the Umngot river, then return.' }
    ],
    bhutan: [
      { day: 1, name: 'Paro (Arrival)', lat: 27.4287, lng: 89.4164, note: 'Arrival at Paro airport, transfer onward.' },
      { day: 1, name: 'Thimphu', lat: 27.4712, lng: 89.6339, note: 'Evening walk around the capital.' },
      { day: 2, name: 'Thimphu Sightseeing', lat: 27.4712, lng: 89.6339, note: 'Buddha Dordenma, Folk Heritage Museum, Tashichho Dzong.' },
      { day: 3, name: 'Punakha', lat: 27.5921, lng: 89.8797, note: 'Punakha Dzong, Chimi Lhakhang fertility temple.' },
      { day: 4, name: "Paro Taktsang (Tiger's Nest)", lat: 27.4915, lng: 89.3637, note: 'The classic cliffside monastery hike.' },
      { day: 5, name: 'Paro (Departure)', lat: 27.4287, lng: 89.4164, note: 'Transfer to Paro airport for departure.' }
    ],
    sikkim: [
      { day: 1, name: 'NJP / Bagdogra (Pickup)', lat: 26.7271, lng: 88.3953, note: 'Arrival transfer up to Gangtok.' },
      { day: 1, name: 'Gangtok', lat: 27.3389, lng: 88.6065, note: 'MG Marg evening walk.' },
      { day: 2, name: 'Tsomgo Lake & Nathula', lat: 27.3747, lng: 88.7601, note: 'Glacial lake; Nathula Pass subject to permits.' },
      { day: 3, name: 'Rumtek Monastery', lat: 27.2836, lng: 88.5614, note: 'Rumtek, Enchey Monastery, Do-Drul Chorten.' },
      { day: 4, name: 'NJP / Bagdogra (Departure)', lat: 26.7271, lng: 88.3953, note: 'Drive back for onward journey.' }
    ],
    anini: [
      { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
      { day: 1, name: 'Roing', lat: 28.1409, lng: 95.8394, note: 'Gateway to Dibang Valley.' },
      { day: 2, name: 'Anini', lat: 28.8167, lng: 95.9333, note: 'River crossings, forest tracks, waterfalls en route.' },
      { day: 3, name: 'Anini & Dibang Valley', lat: 28.8167, lng: 95.9333, note: 'Local trails and river valley walks.' },
      { day: 4, name: 'Mehao Wildlife Sanctuary', lat: 28.1897, lng: 95.8536, note: 'Mehao Lake — birdwatching and forest walks.' },
      { day: 5, name: 'Roing (Return)', lat: 28.1409, lng: 95.8394, note: 'Overnight before the final leg.' },
      { day: 6, name: 'Guwahati (Drop)', lat: 26.1445, lng: 91.7362, note: 'Trip ends.' }
    ],
    dong: [
      { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
      { day: 1, name: 'Tezu', lat: 27.9167, lng: 96.1667, note: 'Base for the Dong Valley route.' },
      { day: 2, name: 'Walong', lat: 28.15, lng: 97.0167, note: 'Scenic border town along the Lohit river.' },
      { day: 3, name: 'Dong Valley', lat: 27.9333, lng: 97.4667, note: 'Final stretch to the village.' },
      { day: 4, name: 'Dong Sunrise Point', lat: 27.9333, lng: 97.4667, note: "India's first sunrise, before returning to Walong." },
      { day: 5, name: 'Guwahati (Return)', lat: 26.1445, lng: 91.7362, note: 'Long drive back via Tezu.' }
    ]
  };

  const updateStops = db.prepare(`UPDATE packages SET route_stops = ? WHERE slug = ? AND (route_stops IS NULL OR route_stops = '[]')`);
  Object.entries(backfill).forEach(([slug, stops]) => {
    updateStops.run(JSON.stringify(stops), slug);
  });
})();

// ─── Seed ─────────────────────────────────────────────────────────────────────

function seed() {
  const hasAdmin = db.prepare('SELECT id FROM admin_users WHERE username = ?').get('admin');
  if (!hasAdmin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  }

  const pkgCount = db.prepare('SELECT COUNT(*) as c FROM packages').get().c;
  if (pkgCount === 0) {
    const insertPkg = db.prepare(`
      INSERT INTO packages (slug, name, route, duration, group_size, vehicle, price, image_path, description, itinerary, inclusions, exclusions, highlights, route_stops, featured, display_order)
      VALUES (@slug, @name, @route, @duration, @group_size, @vehicle, @price, @image_path, @description, @itinerary, @inclusions, @exclusions, @highlights, @route_stops, @featured, @display_order)
    `);

    const packages = [
      {
        slug: 'meghalaya',
        name: 'Meghalaya Explorer',
        route: 'Shillong · Dawki · Cherrapunji',
        duration: '3D / 2N',
        group_size: '2–10 people',
        vehicle: 'Innova',
        price: null,
        image_path: 'assets/destinations/meghalaya.jpg',
        description: "A compact loop through Meghalaya's best-known stops — waterfalls, the living root bridges around Cherrapunji, and the clear waters of Dawki.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Arrive Shillong', content: 'Pickup from Guwahati airport, drive to Shillong, evening at Police Bazar and Ward\'s Lake.' },
          { day: 2, title: 'Cherrapunji', content: 'Nohkalikai Falls, Mawsmai Cave, and a walk toward the living root bridges.' },
          { day: 3, title: 'Dawki & Return', content: 'Boat ride on the Umngot river at Dawki, then drive back toward Guwahati.' }
        ]),
        inclusions: JSON.stringify(['Vehicle & experienced driver', 'Airport / station pickup & drop', 'Point-to-point transfers on the route', 'Trip planning & local guidance']),
        exclusions: JSON.stringify(['Hotels & accommodation', 'Entry permits & fees', 'Meals & personal expenses']),
        highlights: JSON.stringify(['Dawki river boat ride', 'Nohkalikai Falls', 'Living root bridges', 'Mawsmai Cave']),
        route_stops: JSON.stringify([
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Airport / railway station pickup.' },
          { day: 1, name: 'Shillong', lat: 25.5788, lng: 91.8933, note: "Police Bazar & Ward's Lake." },
          { day: 2, name: 'Cherrapunji', lat: 25.2702, lng: 91.7323, note: 'Nohkalikai Falls, Mawsmai Cave, living root bridges.' },
          { day: 3, name: 'Dawki', lat: 25.1966, lng: 92.0202, note: 'Boat ride on the Umngot river, then return.' }
        ]),
        featured: 1,
        display_order: 1
      },
      {
        slug: 'bhutan',
        name: 'Bhutan Escape',
        route: 'Paro · Thimphu · Punakha',
        duration: '5 Days',
        group_size: 'Small groups',
        vehicle: 'Innova',
        price: null,
        image_path: 'assets/destinations/bhutan.jpg',
        description: "A guided journey through Bhutan's western valley towns — Tiger's Nest monastery, Punakha Dzong, and the forested road between Thimphu and Paro.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Arrive Paro', content: 'Arrival at Paro airport, transfer to Thimphu. Evening walk around the capital.' },
          { day: 2, title: 'Thimphu Sightseeing', content: 'Buddha Dordenma statue, Folk Heritage Museum, Tashichho Dzong.' },
          { day: 3, title: 'Punakha Valley', content: 'Drive to Punakha. Punakha Dzong, Chimi Lhakhang fertility temple.' },
          { day: 4, title: "Tiger's Nest Trek", content: "The classic hike to Paro Taktsang (Tiger's Nest). Afternoon at leisure in Paro town." },
          { day: 5, title: 'Departure', content: 'Transfer to Paro airport for departure.' }
        ]),
        inclusions: JSON.stringify(['Vehicle & experienced driver', 'Bhutan permit assistance', 'Airport transfers', 'Point-to-point transfers']),
        exclusions: JSON.stringify(['Bhutan visa/permit fees', 'Hotels & accommodation', 'Meals', 'Airfare']),
        highlights: JSON.stringify(["Tiger's Nest Monastery", 'Punakha Dzong', 'Thimphu sightseeing', 'Forested mountain roads']),
        route_stops: JSON.stringify([
          { day: 1, name: 'Paro (Arrival)', lat: 27.4287, lng: 89.4164, note: 'Arrival at Paro airport, transfer onward.' },
          { day: 1, name: 'Thimphu', lat: 27.4712, lng: 89.6339, note: 'Evening walk around the capital.' },
          { day: 2, name: 'Thimphu Sightseeing', lat: 27.4712, lng: 89.6339, note: 'Buddha Dordenma, Folk Heritage Museum, Tashichho Dzong.' },
          { day: 3, name: 'Punakha', lat: 27.5921, lng: 89.8797, note: 'Punakha Dzong, Chimi Lhakhang fertility temple.' },
          { day: 4, name: "Paro Taktsang (Tiger's Nest)", lat: 27.4915, lng: 89.3637, note: 'The classic cliffside monastery hike.' },
          { day: 5, name: 'Paro (Departure)', lat: 27.4287, lng: 89.4164, note: 'Transfer to Paro airport for departure.' }
        ]),
        featured: 1,
        display_order: 2
      },
      {
        slug: 'sikkim',
        name: 'Sikkim Getaway',
        route: 'Gangtok · Tsomgo Lake · Monasteries',
        duration: '4 Days',
        group_size: '2–8 people',
        vehicle: 'Scorpio',
        price: null,
        image_path: 'assets/destinations/sikkim.jpg',
        description: "High-altitude Sikkim — Gangtok's monastery circuit, Tsomgo lake and Nathula pass (if open), and the Rumtek monastery.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Arrive Gangtok', content: 'Arrive from NJP / Bagdogra, transfer to Gangtok. MG Marg evening walk.' },
          { day: 2, title: 'Tsomgo Lake & Nathula', content: 'Early drive to Tsomgo Lake (3753m). Nathula Pass visit subject to permit availability.' },
          { day: 3, title: 'Monastery Circuit', content: 'Rumtek Monastery, Enchey Monastery, Do-Drul Chorten stupa.' },
          { day: 4, title: 'Return', content: 'Drive back to NJP / Bagdogra for onward journey.' }
        ]),
        inclusions: JSON.stringify(['Vehicle & experienced driver', 'Nathula permit assistance', 'Transfers throughout', 'Local guidance']),
        exclusions: JSON.stringify(['Permits (Nathula, protected area)', 'Hotels & accommodation', 'Meals']),
        highlights: JSON.stringify(['Tsomgo Lake at 3753m', 'Nathula Pass', 'Rumtek Monastery', 'Gangtok MG Marg']),
        route_stops: JSON.stringify([
          { day: 1, name: 'NJP / Bagdogra (Pickup)', lat: 26.7271, lng: 88.3953, note: 'Arrival transfer up to Gangtok.' },
          { day: 1, name: 'Gangtok', lat: 27.3389, lng: 88.6065, note: 'MG Marg evening walk.' },
          { day: 2, name: 'Tsomgo Lake & Nathula', lat: 27.3747, lng: 88.7601, note: 'Glacial lake; Nathula Pass subject to permits.' },
          { day: 3, name: 'Rumtek Monastery', lat: 27.2836, lng: 88.5614, note: 'Rumtek, Enchey Monastery, Do-Drul Chorten.' },
          { day: 4, name: 'NJP / Bagdogra (Departure)', lat: 26.7271, lng: 88.3953, note: 'Drive back for onward journey.' }
        ]),
        featured: 1,
        display_order: 3
      },
      {
        slug: 'anini',
        name: 'Anini Expedition',
        route: 'Dibang Valley · Arunachal Pradesh',
        duration: '6 Days',
        group_size: 'Small groups',
        vehicle: 'Scorpio',
        price: null,
        image_path: 'assets/destinations/anini.jpg',
        description: "One of India's most remote districts — the Dibang Valley road to Anini takes you through pristine forests, river valleys, and Adi tribal villages.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Guwahati to Roing', content: 'Long drive to Roing, the gateway to Dibang Valley. Overnight at Roing.' },
          { day: 2, title: 'Roing to Anini', content: 'Early start. The road to Anini — river crossings, forest tracks, waterfalls.' },
          { day: 3, title: 'Anini & Dibang Valley', content: 'Explore Anini town and surrounding trails. Dibang river valley walks.' },
          { day: 4, title: 'Mehao Wildlife Sanctuary', content: 'Drive toward Mehao Lake. Birdwatching and forest walks.' },
          { day: 5, title: 'Return to Roing', content: 'Drive back. Overnight at Roing.' },
          { day: 6, title: 'Roing to Guwahati', content: 'Return drive to Guwahati.' }
        ]),
        inclusions: JSON.stringify(['4WD vehicle & driver', 'ILP (Inner Line Permit) assistance', 'Transfers throughout', 'Local route planning']),
        exclusions: JSON.stringify(['ILP fees', 'Hotels & accommodation', 'Meals', 'Personal expenses']),
        highlights: JSON.stringify(['Dibang river valley', 'Mehao Wildlife Sanctuary', 'Anini — one of India\'s most remote towns', 'Adi tribal culture']),
        route_stops: JSON.stringify([
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
          { day: 1, name: 'Roing', lat: 28.1409, lng: 95.8394, note: 'Gateway to Dibang Valley.' },
          { day: 2, name: 'Anini', lat: 28.8167, lng: 95.9333, note: 'River crossings, forest tracks, waterfalls en route.' },
          { day: 3, name: 'Anini & Dibang Valley', lat: 28.8167, lng: 95.9333, note: 'Local trails and river valley walks.' },
          { day: 4, name: 'Mehao Wildlife Sanctuary', lat: 28.1897, lng: 95.8536, note: 'Mehao Lake — birdwatching and forest walks.' },
          { day: 5, name: 'Roing (Return)', lat: 28.1409, lng: 95.8394, note: 'Overnight before the final leg.' },
          { day: 6, name: 'Guwahati (Drop)', lat: 26.1445, lng: 91.7362, note: 'Trip ends.' }
        ]),
        featured: 1,
        display_order: 4
      },
      {
        slug: 'dong',
        name: 'Dong Valley Sunrise',
        route: 'Dong Valley · Arunachal Pradesh',
        duration: '5 Days',
        group_size: 'Small groups',
        vehicle: 'Scorpio',
        price: null,
        image_path: 'assets/destinations/dong.jpg',
        description: "Dong village in Anjaw district is the easternmost point of India — famous for being the first place in the country to see the sunrise. A truly off-the-beaten-path expedition.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Guwahati to Tezu', content: 'Drive to Tezu, the base for the Dong Valley route. Overnight.' },
          { day: 2, title: 'Tezu to Walong', content: 'Drive along the Lohit river to Walong, a scenic border town.' },
          { day: 3, title: 'Walong to Dong', content: 'The final stretch to Dong village. Pre-dawn preparation for the next morning.' },
          { day: 4, title: 'Sunrise at Dong', content: 'Wake before dawn to witness India\'s first sunrise. Return to Walong.' },
          { day: 5, title: 'Return to Guwahati', content: 'Long drive back to Guwahati via Tezu.' }
        ]),
        inclusions: JSON.stringify(['4WD vehicle & driver', 'ILP permit assistance', 'Transfers', 'Route planning']),
        exclusions: JSON.stringify(['ILP fees', 'Hotels', 'Meals', 'Personal expenses']),
        highlights: JSON.stringify(['Easternmost point of India', 'First sunrise in India', 'Lohit river valley', 'Walong war memorial']),
        route_stops: JSON.stringify([
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
          { day: 1, name: 'Tezu', lat: 27.9167, lng: 96.1667, note: 'Base for the Dong Valley route.' },
          { day: 2, name: 'Walong', lat: 28.15, lng: 97.0167, note: 'Scenic border town along the Lohit river.' },
          { day: 3, name: 'Dong Valley', lat: 27.9333, lng: 97.4667, note: 'Final stretch to the village.' },
          { day: 4, name: 'Dong Sunrise Point', lat: 27.9333, lng: 97.4667, note: "India's first sunrise, before returning to Walong." },
          { day: 5, name: 'Guwahati (Return)', lat: 26.1445, lng: 91.7362, note: 'Long drive back via Tezu.' }
        ]),
        featured: 1,
        display_order: 5
      },
      {
        slug: 'ziro-fest',
        name: 'Ziro Fest',
        route: 'Guwahati ↔ Ziro Valley',
        duration: '3 Days / 2 Nights',
        group_size: 'Limited seats',
        vehicle: 'SUV',
        price: '₹9,599/- onwards, per person',
        image_path: 'assets/destinations/ziro-fest.jpg',
        description: "Three days of live music under the stars in Ziro Valley — SUV transport from Guwahati, a campsite stay, and full days at one of Northeast India's best-loved outdoor music festivals. Fixed departure: 24–26 Sept 2026, seats limited.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Guwahati to Ziro', content: 'Early departure by SUV, scenic drive through Assam into the Arunachal foothills. Arrive at the festival campsite by evening and settle in.' },
          { day: 2, title: 'Ziro Fest — Full Day', content: 'A full day and night at the festival grounds — live music across genres, food stalls, and the Ziro Valley countryside by daylight.' },
          { day: 3, title: 'Return to Guwahati', content: 'Pack up camp in the morning and begin the drive back, with drop-off in Guwahati by evening.' }
        ]),
        inclusions: JSON.stringify(['SUV transportation (Guwahati ↔ Ziro ↔ Guwahati)', 'Inner Line Permit (ILP)', '2 nights campsite stay', 'Breakfast', 'Fuel & toll charges', 'Driver allowance']),
        exclusions: JSON.stringify(['Ziro Fest entry pass (purchased separately)', 'Lunch & dinner', 'Personal expenses', 'Travel insurance']),
        highlights: JSON.stringify(['Camp under the stars', 'Live music across 3 days', 'Fixed departure — 24–26 Sept 2026', "Ziro Valley's Apatani countryside"]),
        route_stops: JSON.stringify([
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'SUV departs for Ziro Valley.' },
          { day: 1, name: 'Ziro Valley (Campsite)', lat: 27.6, lng: 93.83, note: 'Arrive at the festival campsite, settle in for the night.' },
          { day: 2, name: 'Ziro Fest Grounds', lat: 27.6, lng: 93.83, note: 'Full day and night of live music.' },
          { day: 3, name: 'Guwahati (Return)', lat: 26.1445, lng: 91.7362, note: 'Drive back, drop-off in the evening.' }
        ]),
        featured: 1,
        display_order: 6
      },
      {
        slug: 'kaho',
        name: "Kaho — India's First Village",
        route: 'Tezu · Hawai · Kibithu · Kaho',
        duration: '6 Days',
        group_size: 'Small groups',
        vehicle: 'Scorpio',
        price: null,
        image_path: 'assets/destinations/kaho.jpg',
        description: "Kaho, on the India-China border in Anjaw district, is the easternmost inhabited village in the country — reached via a long, spectacular drive along the Lohit river through Tezu, Hawai and Kibithu. One of the most remote expeditions we run.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Guwahati to Tezu', content: 'Long drive day toward Tezu, the last major town before the border road begins. Overnight in Tezu.' },
          { day: 2, title: 'Tezu to Hawai', content: 'Winding mountain roads along the Lohit river to Hawai, the district headquarters of Anjaw.' },
          { day: 3, title: 'Hawai to Kibithu', content: "Continue deeper along the border road to Kibithu, one of India's easternmost army posts." },
          { day: 4, title: 'Kibithu to Kaho', content: 'Final stretch to Kaho village on the Lohit river, with Chinese infrastructure visible across the border. Explore the village and checkpost area.' },
          { day: 5, title: 'Return to Hawai', content: 'Begin the long drive back toward Tezu.' },
          { day: 6, title: 'Return to Guwahati', content: 'Final leg back to Guwahati.' }
        ]),
        inclusions: JSON.stringify(['4WD vehicle & driver', 'ILP (Inner Line Permit) assistance', 'Transfers throughout', "Route planning for one of India's most remote roads"]),
        exclusions: JSON.stringify(['ILP fees', 'Hotels & homestays', 'Meals', 'Personal expenses']),
        highlights: JSON.stringify(["India's easternmost inhabited village", 'Views across the India-China border', 'Lohit river valley road', "Declared India's official 'first village' in 2022"]),
        route_stops: JSON.stringify([
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
          { day: 1, name: 'Tezu', lat: 27.9167, lng: 96.1667, note: 'Last major town before the border road.' },
          { day: 2, name: 'Hawai', lat: 27.88528, lng: 96.81028, note: 'District headquarters of Anjaw.' },
          { day: 3, name: 'Kibithu', lat: 28.28028, lng: 97.01778, note: "India's easternmost army post." },
          { day: 4, name: 'Kaho', lat: 28.30361, lng: 97.02222, note: 'Easternmost inhabited village — China visible across the river.' },
          { day: 5, name: 'Hawai (Return)', lat: 27.88528, lng: 96.81028, note: 'Beginning the return journey.' },
          { day: 6, name: 'Guwahati (Drop)', lat: 26.1445, lng: 91.7362, note: 'Trip ends.' }
        ]),
        featured: 1,
        display_order: 7
      }
    ];

    packages.forEach(p => insertPkg.run(p));
  }

  const rentalCount = db.prepare('SELECT COUNT(*) as c FROM rentals').get().c;
  if (rentalCount === 0) {
    const insertRental = db.prepare(`
      INSERT INTO rentals (name, seats, tags, image_path, whatsapp, display_order)
      VALUES (@name, @seats, @tags, @image_path, @whatsapp, @display_order)
    `);
    [
      { name: 'Toyota Innova Crysta', seats: '7', tags: JSON.stringify([{ icon: 'fa-users', label: '7 seats' }, { icon: 'fa-gas-pump', label: 'Diesel' }]), image_path: 'assets/rentals/innova.jpg', whatsapp: '916002816370', display_order: 1 },
      { name: 'Maruti Ertiga', seats: '7', tags: JSON.stringify([{ icon: 'fa-users', label: '7 seats' }, { icon: 'fa-snowflake', label: 'AC' }]), image_path: 'assets/rentals/ertiga.jpg', whatsapp: '916002816370', display_order: 2 },
      { name: 'Mahindra Scorpio', seats: '7', tags: JSON.stringify([{ icon: 'fa-mountain', label: 'SUV' }, { icon: 'fa-road', label: 'Mountain-ready' }]), image_path: 'assets/rentals/scorpio.jpg', whatsapp: '916002816370', display_order: 3 },
      { name: 'Swift Dzire', seats: '5', tags: JSON.stringify([{ icon: 'fa-car', label: 'Sedan' }, { icon: 'fa-plane', label: 'Airport pickup' }]), image_path: 'assets/rentals/dzire.jpg', whatsapp: '916002816370', display_order: 4 }
    ].forEach(r => insertRental.run(r));
  }

  const galCount = db.prepare('SELECT COUNT(*) as c FROM gallery').get().c;
  if (galCount === 0) {
    const insertGal = db.prepare(`
      INSERT INTO gallery (image_path, alt_text, is_tall, display_order)
      VALUES (@image_path, @alt_text, @is_tall, @display_order)
    `);
    [
      { image_path: 'assets/gallery/11.jpg', alt_text: 'Northeast India travel moment', is_tall: 1, display_order: 1 },
      { image_path: 'assets/gallery/7.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 2 },
      { image_path: 'assets/gallery/8.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 3 },
      { image_path: 'assets/gallery/12.jpg', alt_text: 'Northeast India travel moment', is_tall: 1, display_order: 4 },
      { image_path: 'assets/gallery/2.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 5 },
      { image_path: 'assets/gallery/10.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 6 },
      { image_path: 'assets/gallery/13.jpg', alt_text: 'Northeast India travel moment', is_tall: 1, display_order: 7 },
      { image_path: 'assets/gallery/9.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 8 },
      { image_path: 'assets/gallery/1.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 9 },
      { image_path: 'assets/gallery/3.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 10 },
      { image_path: 'assets/gallery/4.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 11 },
      { image_path: 'assets/gallery/5.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 12 },
      { image_path: 'assets/gallery/6.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 13 },
      { image_path: 'assets/gallery/14.jpg', alt_text: 'Northeast India travel moment', is_tall: 0, display_order: 14 }
    ].forEach(g => insertGal.run(g));
  }

  // Note: testimonials are intentionally NOT seeded with placeholder data.
  // Reviews only ever enter the table through a genuine visitor submission
  // (POST /api/testimonials/submit) or a manual admin entry, and stay in
  // "pending" status until an admin approves them for the public site.

  const settingCount = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
  if (settingCount === 0) {
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    [
      ['phone', '+91 60028 16370'],
      ['phone_raw', '+916002816370'],
      ['whatsapp', '916002816370'],
      ['instagram', 'touring_buddiez'],
      ['facebook', '#'],
      ['base_location', 'Guwahati, Assam'],
      ['stat_destinations', '12'],
      ['stat_travelers', '800'],
      ['stat_years', '2025'],
      ['stat_rating', '4.9'],
      ['site_description', 'Curated tours and reliable car rentals across Northeast India, based in Guwahati, Assam.'],
      ['response_time', 'usually within the hour']
    ].forEach(([k, v]) => insertSetting.run(k, v));
  }
}

seed();

// ─── Query helpers ─────────────────────────────────────────────────────────────

function parseJSON(row) {
  if (!row) return row;
  ['itinerary', 'inclusions', 'exclusions', 'highlights', 'tags', 'route_stops'].forEach(field => {
    if (row[field] && typeof row[field] === 'string') {
      try { row[field] = JSON.parse(row[field]); } catch { row[field] = []; }
    }
  });
  return row;
}

module.exports = {
  // Auth
  getAdmin: (username) => db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username),
  updateAdminPassword: (id, hash) => db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, id),

  // Packages
  getAllPackages: () => db.prepare('SELECT * FROM packages ORDER BY display_order, id').all().map(parseJSON),
  getFeaturedPackages: () => db.prepare('SELECT * FROM packages WHERE featured = 1 ORDER BY display_order, id').all().map(parseJSON),
  getPackageBySlug: (slug) => parseJSON(db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug)),
  getPackageById: (id) => parseJSON(db.prepare('SELECT * FROM packages WHERE id = ?').get(id)),
  createPackage: (data) => {
    const stmt = db.prepare(`
      INSERT INTO packages (slug, name, route, duration, group_size, vehicle, price, image_path, description, itinerary, inclusions, exclusions, highlights, route_stops, featured, display_order)
      VALUES (@slug, @name, @route, @duration, @group_size, @vehicle, @price, @image_path, @description, @itinerary, @inclusions, @exclusions, @highlights, @route_stops, @featured, @display_order)
    `);
    return stmt.run(data);
  },
  updatePackage: (id, data) => {
    const stmt = db.prepare(`
      UPDATE packages SET slug=@slug, name=@name, route=@route, duration=@duration, group_size=@group_size,
      vehicle=@vehicle, price=@price, image_path=@image_path, description=@description, itinerary=@itinerary,
      inclusions=@inclusions, exclusions=@exclusions, highlights=@highlights, route_stops=@route_stops,
      featured=@featured, display_order=@display_order WHERE id=@id
    `);
    return stmt.run({ ...data, id });
  },
  deletePackage: (id) => db.prepare('DELETE FROM packages WHERE id = ?').run(id),

  // Rentals
  getAllRentals: () => db.prepare('SELECT * FROM rentals ORDER BY display_order, id').all().map(parseJSON),
  getRentalById: (id) => parseJSON(db.prepare('SELECT * FROM rentals WHERE id = ?').get(id)),
  createRental: (data) => db.prepare('INSERT INTO rentals (name, seats, tags, image_path, whatsapp, display_order) VALUES (@name, @seats, @tags, @image_path, @whatsapp, @display_order)').run(data),
  updateRental: (id, data) => db.prepare('UPDATE rentals SET name=@name, seats=@seats, tags=@tags, image_path=@image_path, whatsapp=@whatsapp, display_order=@display_order WHERE id=@id').run({ ...data, id }),
  deleteRental: (id) => db.prepare('DELETE FROM rentals WHERE id = ?').run(id),

  // Gallery
  getAllGallery: () => db.prepare('SELECT * FROM gallery ORDER BY display_order, id').all(),
  getGalleryById: (id) => db.prepare('SELECT * FROM gallery WHERE id = ?').get(id),
  createGalleryItem: (data) => db.prepare('INSERT INTO gallery (image_path, alt_text, is_tall, display_order) VALUES (@image_path, @alt_text, @is_tall, @display_order)').run(data),
  updateGalleryItem: (id, data) => db.prepare('UPDATE gallery SET alt_text=@alt_text, is_tall=@is_tall, display_order=@display_order WHERE id=@id').run({ ...data, id }),
  deleteGalleryItem: (id) => db.prepare('DELETE FROM gallery WHERE id = ?').run(id),

  // Testimonials
  // Public-facing: only reviews an admin has actually approved.
  getApprovedTestimonials: () => db.prepare("SELECT * FROM testimonials WHERE status = 'approved' ORDER BY display_order, id DESC").all(),
  // Admin dashboard: every submission, newest first, so pending ones surface for moderation.
  getAllTestimonials: () => db.prepare('SELECT * FROM testimonials ORDER BY (status = \'pending\') DESC, id DESC').all(),
  getTestimonialById: (id) => db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id),
  // A real visitor submitting the public review form — always starts pending.
  submitTestimonial: (data) => db.prepare(`
    INSERT INTO testimonials (name, package_name, quote, rating, display_order, status, email, created_at)
    VALUES (@name, @package_name, @quote, @rating, 0, 'pending', @email, datetime('now'))
  `).run(data),
  // Admin manually adding a review (e.g. one collected over phone/WhatsApp) — goes live immediately.
  createTestimonial: (data) => db.prepare(`
    INSERT INTO testimonials (name, package_name, quote, rating, display_order, status, email, created_at)
    VALUES (@name, @package_name, @quote, @rating, @display_order, 'approved', @email, datetime('now'))
  `).run(data),
  updateTestimonial: (id, data) => db.prepare('UPDATE testimonials SET name=@name, package_name=@package_name, quote=@quote, rating=@rating, display_order=@display_order WHERE id=@id').run({ ...data, id }),
  setTestimonialStatus: (id, status) => db.prepare('UPDATE testimonials SET status=? WHERE id=?').run(status, id),
  deleteTestimonial: (id) => db.prepare('DELETE FROM testimonials WHERE id = ?').run(id),

  // Settings
  getAllSettings: () => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const out = {};
    rows.forEach(r => out[r.key] = r.value);
    return out;
  },
  getSetting: (key) => {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? r.value : null;
  },
  setSetting: (key, value) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value),

  // Bookings
  // A visitor submitting the booking form on a package page — always starts pending.
  createBooking: (data) => db.prepare(`
    INSERT INTO bookings (name, phone, email, package_slug, package_name, travel_date, group_size, message, status, created_at)
    VALUES (@name, @phone, @email, @package_slug, @package_name, @travel_date, @group_size, @message, 'pending', datetime('now'))
  `).run(data),
  getAllBookings: () => db.prepare("SELECT * FROM bookings ORDER BY (status = 'pending') DESC, id DESC").all(),
  getBookingById: (id) => db.prepare('SELECT * FROM bookings WHERE id = ?').get(id),
  setBookingStatus: (id, status) => db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status, id),
  deleteBooking: (id) => db.prepare('DELETE FROM bookings WHERE id = ?').run(id),

  // Enquiries
  // Every contact-form submission lands here first, regardless of whether the
  // visitor also opens WhatsApp — so nothing gets lost if they never send that message.
  createEnquiry: (data) => db.prepare(`
    INSERT INTO enquiries (name, phone, email, message, source, status, created_at)
    VALUES (@name, @phone, @email, @message, @source, 'new', datetime('now'))
  `).run(data),
  getAllEnquiries: () => db.prepare("SELECT * FROM enquiries ORDER BY (status = 'new') DESC, id DESC").all(),
  getEnquiryById: (id) => db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id),
  setEnquiryStatus: (id, status) => db.prepare('UPDATE enquiries SET status=? WHERE id=?').run(status, id),
  deleteEnquiry: (id) => db.prepare('DELETE FROM enquiries WHERE id = ?').run(id),

  // Stats (for the admin analytics dashboard)
  getStats: () => {
    const packages = db.prepare('SELECT COUNT(*) as c FROM packages').get().c;
    const bookings = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
    const bookingsPending = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'pending'").get().c;
    const bookingsConfirmed = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'confirmed'").get().c;
    const enquiries = db.prepare('SELECT COUNT(*) as c FROM enquiries').get().c;
    const enquiriesNew = db.prepare("SELECT COUNT(*) as c FROM enquiries WHERE status = 'new'").get().c;
    const testimonialsPending = db.prepare("SELECT COUNT(*) as c FROM testimonials WHERE status = 'pending'").get().c;
    const mostBookedPackage = db.prepare(`
      SELECT package_name, COUNT(*) as c FROM bookings
      WHERE package_name IS NOT NULL AND package_name != ''
      GROUP BY package_name ORDER BY c DESC LIMIT 1
    `).get();
    const bookingsByDay = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as c FROM bookings
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY day ORDER BY day
    `).all();
    return {
      packages, bookings, bookingsPending, bookingsConfirmed,
      enquiries, enquiriesNew, testimonialsPending,
      mostBookedPackage: mostBookedPackage ? mostBookedPackage.package_name : null,
      bookingsByDay
    };
  }
};
