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

// ─── Startup integrity check ───────────────────────────────────────────────────
// A malformed SQLite file crashes the very first PRAGMA call in the old
// code (`journal_mode = WAL`), which means the process exits nonzero,
// Render restarts it, it crashes again — an infinite, silent crash loop
// with the service permanently down and no way for it to recover on its
// own. This checks the file in isolation *before* opening the real
// connection, and if it's genuinely unreadable, moves it aside (renamed,
// never deleted) and lets the schema/seed step below build a fresh
// database, so the site comes back online instead of crash-looping
// forever. The corrupt file and its WAL/SHM siblings are preserved next to
// it with a timestamp, in case they're recoverable later (e.g. via the
// sqlite3 CLI's `.recover` command from a Render Shell session).
function quarantineIfCorrupt(dbPath) {
  if (!fs.existsSync(dbPath)) return; // nothing to check — a fresh DB will be created normally
  let healthy = false;
  try {
    const probe = new Database(dbPath, { readonly: true, fileMustExist: true });
    const result = probe.pragma('integrity_check');
    probe.close();
    healthy = Array.isArray(result) && result.length === 1 && result[0].integrity_check === 'ok';
  } catch (err) {
    healthy = false;
  }
  if (healthy) return;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  console.error(
    `[db] FATAL: ${dbPath} failed its integrity check on startup (this is what was ` +
    `crashing the deploy). Preserving it as *.corrupt-${stamp} rather than deleting it, ` +
    `and starting a fresh database so the site can come back online. If you need to ` +
    `recover data from the corrupt file, open a Render Shell and inspect ` +
    `"${dbPath}.corrupt-${stamp}" with the sqlite3 CLI's ".recover" command.`
  );
  [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach((p) => {
    if (fs.existsSync(p)) {
      try { fs.renameSync(p, `${p}.corrupt-${stamp}`); }
      catch (e) { console.error(`[db] Could not move aside ${p}:`, e.message); }
    }
  });
}

quarantineIfCorrupt(DB_PATH);

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

  CREATE TABLE IF NOT EXISTS availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_slug TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_availability_slug ON availability(package_slug);
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
        name: 'Anini Adventure',
        route: 'Guwahati · Dibrugarh · Mayodia Pass · Anini',
        duration: '5 Days / 4 Nights',
        group_size: 'Small groups',
        vehicle: 'Scorpio',
        price: '₹16,999/- onwards',
        image_path: 'assets/destinations/anini.jpg',
        description: "Five days deep into the Dibang Valley — over Mayodia Pass at 8,000+ ft, through Mishmi villages, to waterfalls and river valley views most travellers never reach. Customizable and extendable.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Guwahati to Dibrugarh', content: 'Pickup from Guwahati airport/station. Scenic drive along the Brahmaputra Valley, past tea gardens and local villages. Evening at leisure, overnight in Dibrugarh.' },
          { day: 2, title: 'Dibrugarh to Anini via Mayodia Pass', content: 'Early start, crossing the Dibang river and ascending to snowy Mayodia Pass (8,000+ ft) — stop for panoramic views and photography. Descend through Mishmi tribal villages into Anini by evening.' },
          { day: 3, title: 'Anini Sightseeing', content: "Scenic drive on the raw Bruni Road, riverside time at Chigu Camp, and visits to Matu and Mawu waterfalls with views across the Dri River Valley." },
          { day: 4, title: 'Anini to Dibrugarh', content: 'Mountain descent with valley views, arriving back in Dibrugarh for an overnight stay.' },
          { day: 5, title: 'Dibrugarh to Guwahati', content: 'Morning check-out and final travel back to Guwahati for drop-off.' }
        ]),
        inclusions: JSON.stringify(['Private vehicle', 'Expert driver allowance', 'Stays', 'Sightseeing', 'Inner Line Permit']),
        exclusions: JSON.stringify(['Meals (unless arranged separately)', 'Personal expenses', 'Travel insurance']),
        highlights: JSON.stringify(['Mayodia Pass at 8,000+ ft', 'Matu & Mawu waterfalls', 'Dri River Valley views', 'Mishmi tribal villages', 'Customizable & extendable itinerary']),
        route_stops: JSON.stringify([
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point — airport/station pickup.' },
          { day: 1, name: 'Dibrugarh', lat: 27.4728, lng: 94.912, note: 'Scenic Brahmaputra Valley drive; overnight stay.' },
          { day: 2, name: 'Mayodia Pass', lat: 28.6167, lng: 95.95, note: '8,000+ ft — panoramic views and photography.' },
          { day: 2, name: 'Anini', lat: 28.8167, lng: 95.9333, note: 'Arrival through Mishmi villages.' },
          { day: 3, name: 'Anini Sightseeing', lat: 28.8167, lng: 95.9333, note: 'Bruni Road, Chigu Camp, Matu & Mawu waterfalls, Dri River Valley.' },
          { day: 4, name: 'Dibrugarh (Return)', lat: 27.4728, lng: 94.912, note: 'Mountain descent, overnight stay.' },
          { day: 5, name: 'Guwahati (Drop)', lat: 26.1445, lng: 91.7362, note: 'Trip ends.' }
        ]),
        featured: 1,
        display_order: 4
      },
      {
        slug: 'dong',
        name: 'Dong, Tilam & Kaho Circuit',
        route: 'Dong · Tilam · Kibithoo · Kaho · Arunachal Pradesh',
        duration: '5 Days / 4 Nights',
        group_size: 'Small groups',
        vehicle: 'Scorpio',
        price: '₹15,999/- onwards, per person',
        image_path: 'assets/destinations/dong.jpg',
        description: "The far edge of India in one circuit — Dong's sunrise, Tilam's hot spring, Kibithoo (India's last outpost) and Kaho, the country's easternmost inhabited village, on the China border. Travel with a local, experience the real Northeast.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Guwahati to Tezu', content: 'Long drive day toward Tezu, the last major town before the border road begins. Overnight in Tezu.' },
          { day: 2, title: 'Tezu to Dong Valley', content: 'Drive along the Lohit river into Dong Valley, timed for its famous sunrise — among the first in India.' },
          { day: 3, title: 'Dong to Tilam', content: "Continue to Tilam for its hot water spring, then on toward Kibithoo, one of India's easternmost army posts." },
          { day: 4, title: 'Kibithoo to Kaho', content: "Final stretch to Kaho — India's easternmost inhabited village, with Chinese infrastructure visible across the border." },
          { day: 5, title: 'Return to Guwahati', content: 'Long drive back to Guwahati via Tezu.' }
        ]),
        inclusions: JSON.stringify(['Transportation (Guwahati to Guwahati)', 'Stays', 'Food', 'Entry fees', 'Guide', 'Inner Line Permits']),
        exclusions: JSON.stringify(['Personal expenses', 'Travel insurance']),
        highlights: JSON.stringify(['Dong Valley sunrise', 'Tilam hot water spring', "Kibithoo — India's last village", 'Kaho — the heavenly village, on the China border']),
        route_stops: JSON.stringify([
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
          { day: 1, name: 'Tezu', lat: 27.9167, lng: 96.1667, note: 'Last major town before the border road.' },
          { day: 2, name: 'Dong Valley', lat: 27.9333, lng: 97.4667, note: "Sunrise point — among the first in India." },
          { day: 3, name: 'Tilam', lat: 27.95, lng: 97.0, note: 'Hot water spring.' },
          { day: 3, name: 'Kibithoo', lat: 28.28028, lng: 97.01778, note: "India's easternmost army post." },
          { day: 4, name: 'Kaho', lat: 28.30361, lng: 97.02222, note: 'Easternmost inhabited village — China visible across the river.' },
          { day: 5, name: 'Guwahati (Return)', lat: 26.1445, lng: 91.7362, note: 'Trip ends.' }
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
        slug: 'anini-winter-fest',
        name: 'Anini Winter Fest 2026',
        route: 'Anini · Dibang Valley · Arunachal Pradesh',
        duration: '2 Days / 1 Night',
        group_size: 'DM for availability',
        vehicle: '',
        price: null,
        image_path: 'assets/destinations/anini.jpg',
        description: "A festival like no other, in the heart of the untamed Dibang Valley — live music, riverside camping, ATV rides and Idu Mishmi culture. 19–20 September 2026, at Anini. DM us for details and itinerary.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Arrival & Camp', content: 'Arrive at Anini, camp set-up by the riverside. Evening live music and artist performances under the stars.' },
          { day: 2, title: 'Festival Day', content: 'ATV rides and adventure activities, exploring hidden gems of the Dibang Valley, and local food paired with Idu Mishmi cultural experiences.' }
        ]),
        inclusions: JSON.stringify([]),
        exclusions: JSON.stringify([]),
        highlights: JSON.stringify(['Live music & artist performances', 'Camping & sunset vibes by the river', 'ATV rides & adventure activities', 'Idu Mishmi culture & local food', 'Hidden gems of Dibang Valley']),
        route_stops: JSON.stringify([
          { day: 1, name: 'Anini (Festival Venue)', lat: 28.8167, lng: 95.9333, note: 'Arrive, camp set-up, evening live music.' },
          { day: 2, name: 'Anini (Festival Venue)', lat: 28.8167, lng: 95.9333, note: 'ATV rides, local culture, food, and adventure activities.' }
        ]),
        featured: 1,
        display_order: 7
      },
      {
        slug: 'gongkar-la',
        name: 'Gongkar La Lake',
        route: 'Mago · Chuna Valley · Gongkar La · Arunachal Pradesh',
        duration: '3 Days / 2 Nights',
        group_size: 'Small groups',
        vehicle: 'Scorpio',
        price: '₹7,999/- onwards, per person',
        image_path: 'assets/destinations/gongkar-la.jpg',
        description: "A high-altitude 3-day escape to Gongkar La Lake, exploring Mago and Chuna Valley in Arunachal Pradesh.",
        itinerary: JSON.stringify([
          { day: 1, title: 'Approach to Mago', content: 'Departure toward Mago, climbing into high-altitude Arunachal terrain.' },
          { day: 2, title: 'Chuna Valley & Gongkar La Lake', content: 'A full day exploring Chuna Valley and the still waters of Gongkar La Lake.' },
          { day: 3, title: 'Return Journey', content: 'Drive back, descending out of the high valley.' }
        ]),
        inclusions: JSON.stringify([]),
        exclusions: JSON.stringify([]),
        highlights: JSON.stringify(['Gongkar La Lake', 'Mago', 'Chuna Valley']),
        route_stops: JSON.stringify([
          { day: 1, name: 'Mago', lat: 27.83, lng: 91.98, note: 'High-altitude approach.' },
          { day: 2, name: 'Chuna Valley & Gongkar La Lake', lat: 27.85, lng: 91.95, note: 'Full day exploring the valley and lake.' },
          { day: 3, name: 'Return', lat: 27.83, lng: 91.98, note: 'Drive back out of the valley.' }
        ]),
        featured: 1,
        display_order: 8
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
      { name: 'Toyota Innova Crysta', seats: '7', tags: JSON.stringify([{ icon: 'fa-users', label: '7 seats' }, { icon: 'fa-gas-pump', label: 'Diesel' }]), image_path: 'assets/rentals/innova.jpg', whatsapp: '919707386186', display_order: 1 },
      { name: 'Maruti Ertiga', seats: '7', tags: JSON.stringify([{ icon: 'fa-users', label: '7 seats' }, { icon: 'fa-snowflake', label: 'AC' }]), image_path: 'assets/rentals/ertiga.jpg', whatsapp: '919707386186', display_order: 2 },
      { name: 'Mahindra Scorpio', seats: '7', tags: JSON.stringify([{ icon: 'fa-mountain', label: 'SUV' }, { icon: 'fa-road', label: 'Mountain-ready' }]), image_path: 'assets/rentals/scorpio.jpg', whatsapp: '919707386186', display_order: 3 },
      { name: 'Swift Dzire', seats: '5', tags: JSON.stringify([{ icon: 'fa-car', label: 'Sedan' }, { icon: 'fa-plane', label: 'Airport pickup' }]), image_path: 'assets/rentals/dzire.jpg', whatsapp: '919707386186', display_order: 4 }
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
      ['phone', '+91 97073 86186'],
      ['phone_raw', '+919707386186'],
      ['whatsapp', '919707386186'],
      ['instagram', 'touring_buddiez'],
      ['facebook', '#'],
      ['base_location', 'Guwahati, Assam'],
      ['site_description', 'Curated tours and reliable car rentals across Northeast India, based in Guwahati, Assam.'],
      ['response_time', 'usually within the hour']
    ].forEach(([k, v]) => insertSetting.run(k, v));
  }
}

seed();

// ─── Content refresh: real flyer data (Sept 2026) ──────────────────────────────
// Updates 'anini' and 'dong' with the business's current real itineraries/
// pricing, retires the separate 'kaho' package (now folded into the 'dong'
// combined circuit), and adds two packages that didn't exist yet
// ('anini-winter-fest', 'gongkar-la'). seed() only inserts when the whole
// table is empty, so an already-live database needs this explicit one-time
// pass instead — guarded by a settings flag so it never re-runs and
// overwrites anything an admin edits afterward.
(function migratePackagesContentV2() {
  const already = db.prepare(`SELECT value FROM settings WHERE key = 'content_migration_v2'`).get();
  if (already) return;

  const pkgExists = (slug) => db.prepare('SELECT id FROM packages WHERE slug = ?').get(slug);

  if (pkgExists('anini')) {
    db.prepare(`
      UPDATE packages SET
        name = ?, route = ?, duration = ?, price = ?, description = ?,
        itinerary = ?, inclusions = ?, exclusions = ?, highlights = ?, route_stops = ?
      WHERE slug = 'anini'
    `).run(
      'Anini Adventure',
      'Guwahati · Dibrugarh · Mayodia Pass · Anini',
      '5 Days / 4 Nights',
      '₹16,999/- onwards',
      "Five days deep into the Dibang Valley — over Mayodia Pass at 8,000+ ft, through Mishmi villages, to waterfalls and river valley views most travellers never reach. Customizable and extendable.",
      JSON.stringify([
        { day: 1, title: 'Guwahati to Dibrugarh', content: 'Pickup from Guwahati airport/station. Scenic drive along the Brahmaputra Valley, past tea gardens and local villages. Evening at leisure, overnight in Dibrugarh.' },
        { day: 2, title: 'Dibrugarh to Anini via Mayodia Pass', content: 'Early start, crossing the Dibang river and ascending to snowy Mayodia Pass (8,000+ ft) — stop for panoramic views and photography. Descend through Mishmi tribal villages into Anini by evening.' },
        { day: 3, title: 'Anini Sightseeing', content: "Scenic drive on the raw Bruni Road, riverside time at Chigu Camp, and visits to Matu and Mawu waterfalls with views across the Dri River Valley." },
        { day: 4, title: 'Anini to Dibrugarh', content: 'Mountain descent with valley views, arriving back in Dibrugarh for an overnight stay.' },
        { day: 5, title: 'Dibrugarh to Guwahati', content: 'Morning check-out and final travel back to Guwahati for drop-off.' }
      ]),
      JSON.stringify(['Private vehicle', 'Expert driver allowance', 'Stays', 'Sightseeing', 'Inner Line Permit']),
      JSON.stringify(['Meals (unless arranged separately)', 'Personal expenses', 'Travel insurance']),
      JSON.stringify(['Mayodia Pass at 8,000+ ft', 'Matu & Mawu waterfalls', 'Dri River Valley views', 'Mishmi tribal villages', 'Customizable & extendable itinerary']),
      JSON.stringify([
        { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point — airport/station pickup.' },
        { day: 1, name: 'Dibrugarh', lat: 27.4728, lng: 94.912, note: 'Scenic Brahmaputra Valley drive; overnight stay.' },
        { day: 2, name: 'Mayodia Pass', lat: 28.6167, lng: 95.95, note: '8,000+ ft — panoramic views and photography.' },
        { day: 2, name: 'Anini', lat: 28.8167, lng: 95.9333, note: 'Arrival through Mishmi villages.' },
        { day: 3, name: 'Anini Sightseeing', lat: 28.8167, lng: 95.9333, note: 'Bruni Road, Chigu Camp, Matu & Mawu waterfalls, Dri River Valley.' },
        { day: 4, name: 'Dibrugarh (Return)', lat: 27.4728, lng: 94.912, note: 'Mountain descent, overnight stay.' },
        { day: 5, name: 'Guwahati (Drop)', lat: 26.1445, lng: 91.7362, note: 'Trip ends.' }
      ])
    );
  }

  if (pkgExists('dong')) {
    db.prepare(`
      UPDATE packages SET
        name = ?, route = ?, duration = ?, price = ?, description = ?,
        itinerary = ?, inclusions = ?, exclusions = ?, highlights = ?, route_stops = ?
      WHERE slug = 'dong'
    `).run(
      'Dong, Tilam & Kaho Circuit',
      'Dong · Tilam · Kibithoo · Kaho · Arunachal Pradesh',
      '5 Days / 4 Nights',
      '₹15,999/- onwards, per person',
      "The far edge of India in one circuit — Dong's sunrise, Tilam's hot spring, Kibithoo (India's last outpost) and Kaho, the country's easternmost inhabited village, on the China border. Travel with a local, experience the real Northeast.",
      JSON.stringify([
        { day: 1, title: 'Guwahati to Tezu', content: 'Long drive day toward Tezu, the last major town before the border road begins. Overnight in Tezu.' },
        { day: 2, title: 'Tezu to Dong Valley', content: 'Drive along the Lohit river into Dong Valley, timed for its famous sunrise — among the first in India.' },
        { day: 3, title: 'Dong to Tilam', content: "Continue to Tilam for its hot water spring, then on toward Kibithoo, one of India's easternmost army posts." },
        { day: 4, title: 'Kibithoo to Kaho', content: "Final stretch to Kaho — India's easternmost inhabited village, with Chinese infrastructure visible across the border." },
        { day: 5, title: 'Return to Guwahati', content: 'Long drive back to Guwahati via Tezu.' }
      ]),
      JSON.stringify(['Transportation (Guwahati to Guwahati)', 'Stays', 'Food', 'Entry fees', 'Guide', 'Inner Line Permits']),
      JSON.stringify(['Personal expenses', 'Travel insurance']),
      JSON.stringify(['Dong Valley sunrise', 'Tilam hot water spring', "Kibithoo — India's last village", 'Kaho — the heavenly village, on the China border']),
      JSON.stringify([
        { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
        { day: 1, name: 'Tezu', lat: 27.9167, lng: 96.1667, note: 'Last major town before the border road.' },
        { day: 2, name: 'Dong Valley', lat: 27.9333, lng: 97.4667, note: "Sunrise point — among the first in India." },
        { day: 3, name: 'Tilam', lat: 27.95, lng: 97.0, note: 'Hot water spring.' },
        { day: 3, name: 'Kibithoo', lat: 28.28028, lng: 97.01778, note: "India's easternmost army post." },
        { day: 4, name: 'Kaho', lat: 28.30361, lng: 97.02222, note: 'Easternmost inhabited village — China visible across the river.' },
        { day: 5, name: 'Guwahati (Return)', lat: 26.1445, lng: 91.7362, note: 'Trip ends.' }
      ])
    );
  }

  // 'kaho' is now the same trip as the updated 'dong' circuit above —
  // delete it rather than leave two package pages selling the same route.
  // No foreign key references this table by slug (bookings/enquiries just
  // store a text snapshot), so this is safe.
  db.prepare(`DELETE FROM packages WHERE slug = 'kaho'`).run();

  if (!pkgExists('anini-winter-fest')) {
    db.prepare(`
      INSERT INTO packages (slug, name, route, duration, group_size, vehicle, price, image_path, description, itinerary, inclusions, exclusions, highlights, route_stops, featured, display_order)
      VALUES (@slug, @name, @route, @duration, @group_size, @vehicle, @price, @image_path, @description, @itinerary, @inclusions, @exclusions, @highlights, @route_stops, @featured, @display_order)
    `).run({
      slug: 'anini-winter-fest',
      name: 'Anini Winter Fest 2026',
      route: 'Anini · Dibang Valley · Arunachal Pradesh',
      duration: '2 Days / 1 Night',
      group_size: 'DM for availability',
      vehicle: '',
      price: null,
      image_path: 'assets/destinations/anini.jpg',
      description: "A festival like no other, in the heart of the untamed Dibang Valley — live music, riverside camping, ATV rides and Idu Mishmi culture. 19–20 September 2026, at Anini. DM us for details and itinerary.",
      itinerary: JSON.stringify([
        { day: 1, title: 'Arrival & Camp', content: 'Arrive at Anini, camp set-up by the riverside. Evening live music and artist performances under the stars.' },
        { day: 2, title: 'Festival Day', content: 'ATV rides and adventure activities, exploring hidden gems of the Dibang Valley, and local food paired with Idu Mishmi cultural experiences.' }
      ]),
      inclusions: JSON.stringify([]),
      exclusions: JSON.stringify([]),
      highlights: JSON.stringify(['Live music & artist performances', 'Camping & sunset vibes by the river', 'ATV rides & adventure activities', 'Idu Mishmi culture & local food', 'Hidden gems of Dibang Valley']),
      route_stops: JSON.stringify([
        { day: 1, name: 'Anini (Festival Venue)', lat: 28.8167, lng: 95.9333, note: 'Arrive, camp set-up, evening live music.' },
        { day: 2, name: 'Anini (Festival Venue)', lat: 28.8167, lng: 95.9333, note: 'ATV rides, local culture, food, and adventure activities.' }
      ]),
      featured: 1,
      display_order: 7
    });
  }

  if (!pkgExists('gongkar-la')) {
    db.prepare(`
      INSERT INTO packages (slug, name, route, duration, group_size, vehicle, price, image_path, description, itinerary, inclusions, exclusions, highlights, route_stops, featured, display_order)
      VALUES (@slug, @name, @route, @duration, @group_size, @vehicle, @price, @image_path, @description, @itinerary, @inclusions, @exclusions, @highlights, @route_stops, @featured, @display_order)
    `).run({
      slug: 'gongkar-la',
      name: 'Gongkar La Lake',
      route: 'Mago · Chuna Valley · Gongkar La · Arunachal Pradesh',
      duration: '3 Days / 2 Nights',
      group_size: 'Small groups',
      vehicle: 'Scorpio',
      price: '₹7,999/- onwards, per person',
      image_path: 'assets/destinations/gongkar-la.jpg',
      description: "A high-altitude 3-day escape to Gongkar La Lake, exploring Mago and Chuna Valley in Arunachal Pradesh.",
      itinerary: JSON.stringify([
        { day: 1, title: 'Approach to Mago', content: 'Departure toward Mago, climbing into high-altitude Arunachal terrain.' },
        { day: 2, title: 'Chuna Valley & Gongkar La Lake', content: 'A full day exploring Chuna Valley and the still waters of Gongkar La Lake.' },
        { day: 3, title: 'Return Journey', content: 'Drive back, descending out of the high valley.' }
      ]),
      inclusions: JSON.stringify([]),
      exclusions: JSON.stringify([]),
      highlights: JSON.stringify(['Gongkar La Lake', 'Mago', 'Chuna Valley']),
      route_stops: JSON.stringify([
        { day: 1, name: 'Mago', lat: 27.83, lng: 91.98, note: 'High-altitude approach.' },
        { day: 2, name: 'Chuna Valley & Gongkar La Lake', lat: 27.85, lng: 91.95, note: 'Full day exploring the valley and lake.' },
        { day: 3, name: 'Return', lat: 27.83, lng: 91.98, note: 'Drive back out of the valley.' }
      ]),
      featured: 1,
      display_order: 8
    });
  }

  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('content_migration_v2', datetime('now'))`).run();
})();

// ─── Content refresh: new self-drive rentals (Sept 2026) ───────────────────────
// ─── Fix: 'phone' setting didn't match 'phone_raw' in earlier seeds ────────────
// A past seed set phone_raw to the current number but left the human-readable
// 'phone' display value on an old one — anywhere that showed 'phone' directly
// was showing the wrong number. One-time correction, guarded so it never
// stomps a phone number an admin has since typed in themselves.
(function migratePhoneSettingV2() {
  const already = db.prepare(`SELECT value FROM settings WHERE key = 'phone_migration_v2'`).get();
  if (already) return;

  const current = db.prepare(`SELECT value FROM settings WHERE key = 'phone'`).get();
  if (current && current.value === '+91 60028 16370') {
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'phone'`).run('+91 97073 86186');
  }
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('phone_migration_v2', datetime('now'))`).run();
})();

(function migrateRentalsContentV2() {
  const already = db.prepare(`SELECT value FROM settings WHERE key = 'rentals_migration_v2'`).get();
  if (already) return;

  const rentalExists = (name) => db.prepare('SELECT id FROM rentals WHERE name = ?').get(name);
  const insertRental = db.prepare(`
    INSERT INTO rentals (name, seats, tags, image_path, whatsapp, display_order)
    VALUES (@name, @seats, @tags, @image_path, @whatsapp, @display_order)
  `);
  const rentalCount = db.prepare('SELECT COUNT(*) as c FROM rentals').get().c;

  if (!rentalExists('Hyundai i20 (Self-Drive)')) {
    insertRental.run({
      name: 'Hyundai i20 (Self-Drive)',
      seats: '5',
      tags: JSON.stringify([{ icon: 'fa-car', label: 'Hatchback' }, { icon: 'fa-key', label: 'Self-drive' }]),
      image_path: 'assets/rentals/i20-selfdrive.jpg',
      whatsapp: '919707386186',
      display_order: rentalCount + 1
    });
  }
  if (!rentalExists('Mahindra Thar Roxx (Self-Drive)')) {
    insertRental.run({
      name: 'Mahindra Thar Roxx (Self-Drive)',
      seats: '5',
      tags: JSON.stringify([{ icon: 'fa-mountain', label: 'SUV' }, { icon: 'fa-key', label: 'Self-drive' }]),
      image_path: 'assets/rentals/thar-roxx-selfdrive.jpg',
      whatsapp: '919707386186',
      display_order: rentalCount + 2
    });
  }

  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('rentals_migration_v2', datetime('now'))`).run();
})();

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

  // Availability blocks
  // Public: dates blocked out for one package (used by the package detail page's calendar).
  getAvailabilityBySlug: (slug) => db.prepare(
    'SELECT * FROM availability WHERE package_slug = ? ORDER BY start_date'
  ).all(slug),
  // Admin: every block across every package, joined to the package name for display.
  getAllAvailability: () => db.prepare(`
    SELECT a.*, p.name AS package_name
    FROM availability a
    LEFT JOIN packages p ON p.slug = a.package_slug
    ORDER BY a.start_date DESC, a.id DESC
  `).all(),
  createAvailabilityBlock: (data) => db.prepare(`
    INSERT INTO availability (package_slug, start_date, end_date, reason)
    VALUES (@package_slug, @start_date, @end_date, @reason)
  `).run(data),
  deleteAvailabilityBlock: (id) => db.prepare('DELETE FROM availability WHERE id = ?').run(id),

  // Stats (for the admin analytics dashboard)
  getStats: () => {
    const packages = db.prepare('SELECT COUNT(*) as c FROM packages').get().c;
    const bookings = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
    const bookingsPending = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'pending'").get().c;
    const bookingsConfirmed = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'confirmed'").get().c;
    const bookingsCancelled = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'cancelled'").get().c;
    const enquiries = db.prepare('SELECT COUNT(*) as c FROM enquiries').get().c;
    const enquiriesNew = db.prepare("SELECT COUNT(*) as c FROM enquiries WHERE status = 'new'").get().c;
    const enquiriesClosed = db.prepare("SELECT COUNT(*) as c FROM enquiries WHERE status = 'closed'").get().c;
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
    // Packages ranked by booking volume — enquiries aren't linked to a specific
    // package in the schema, so this reflects bookings only.
    const packagePopularity = db.prepare(`
      SELECT package_name AS name, COUNT(*) as count FROM bookings
      WHERE package_name IS NOT NULL AND package_name != ''
      GROUP BY package_name ORDER BY count DESC LIMIT 6
    `).all();
    // Most recent bookings + enquiries combined, newest first, for the dashboard feed.
    const recentActivity = db.prepare(`
      SELECT 'booking' AS type, name, package_name, status, created_at FROM bookings
      UNION ALL
      SELECT 'enquiry' AS type, name, NULL AS package_name, status, created_at FROM enquiries
      ORDER BY created_at DESC LIMIT 8
    `).all();
    return {
      packages, bookings, bookingsPending, bookingsConfirmed, bookingsCancelled,
      enquiries, enquiriesNew, enquiriesClosed, testimonialsPending,
      mostBookedPackage: mostBookedPackage ? mostBookedPackage.package_name : null,
      bookingsByDay, packagePopularity, recentActivity
    };
  },

  // Exposed so server.js can checkpoint WAL and close the file handle
  // cleanly on shutdown, instead of leaving the process to be killed mid-write.
  close: () => db.close()
};
