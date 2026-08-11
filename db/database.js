const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ─── Connection ─────────────────────────────────────────────────────────────
// Render's free-tier disk is ephemeral — anything written to a local file
// (including the old SQLite .db) is wiped on every restart/redeploy. MongoDB
// Atlas is a separate, always-on database, so admin edits now actually persist.

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(
    '\n[FATAL] MONGODB_URI is not set. This app now requires a MongoDB ' +
    'connection string — see MONGODB_SETUP.md for how to create a free ' +
    'Atlas cluster and set this environment variable.\n'
  );
  process.exit(1);
}

mongoose.set('strictQuery', true);

let connectedOnce = false;
mongoose.connection.on('connected', () => {
  connectedOnce = true;
  console.log('[db] Connected to MongoDB');
});
mongoose.connection.on('error', (err) => {
  console.error('[db] MongoDB connection error:', err.message);
});
mongoose.connection.on('disconnected', () => {
  if (connectedOnce) console.warn('[db] MongoDB disconnected — will retry automatically.');
});

mongoose.connect(MONGODB_URI).catch((err) => {
  console.error('[FATAL] Could not connect to MongoDB:', err.message);
  process.exit(1);
});

// ─── Auto-increment id helper ───────────────────────────────────────────────
// Keeps every document's public `id` field a small integer (1, 2, 3…) instead
// of a Mongo ObjectId, so nothing on the front end (admin.js, site-data.js)
// had to change — they already expect plain numeric ids.

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('Counter', counterSchema);

async function nextId(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const AdminUserSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  username: { type: String, unique: true, required: true },
  password_hash: { type: String, required: true }
});

const PackageSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  slug: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  route: String,
  duration: String,
  group_size: String,
  vehicle: String,
  price: String,
  image_path: String,
  description: String,
  itinerary: { type: Array, default: [] },
  inclusions: { type: Array, default: [] },
  exclusions: { type: Array, default: [] },
  highlights: { type: Array, default: [] },
  route_stops: { type: Array, default: [] },
  featured: { type: Number, default: 0 },
  display_order: { type: Number, default: 0 },
  created_at: { type: String, default: () => new Date().toISOString() }
});

const RentalSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: { type: String, required: true },
  seats: String,
  tags: { type: Array, default: [] },
  image_path: String,
  whatsapp: String,
  display_order: { type: Number, default: 0 }
});

const GallerySchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  image_path: { type: String, required: true },
  alt_text: String,
  location: String,
  is_tall: { type: Number, default: 0 },
  display_order: { type: Number, default: 0 },
  created_at: { type: String, default: () => new Date().toISOString() }
});

const TestimonialSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: { type: String, required: true },
  package_name: String,
  quote: String,
  rating: { type: Number, default: 5 },
  display_order: { type: Number, default: 0 },
  status: { type: String, default: 'pending' },
  email: String,
  created_at: { type: String, default: () => new Date().toISOString() }
});

const SettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: String
}, { _id: false });

const BookingSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: String,
  package_slug: String,
  package_name: String,
  travel_date: String,
  group_size: String,
  message: String,
  status: { type: String, default: 'pending' },
  created_at: { type: String, default: () => new Date().toISOString() }
});

const AvailabilityBlockSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  package_slug: { type: String, required: true },
  start_date: { type: String, required: true },
  end_date: { type: String, required: true },
  reason: String,
  created_at: { type: String, default: () => new Date().toISOString() }
});

const EnquirySchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: { type: String, required: true },
  phone: String,
  email: String,
  message: String,
  source: { type: String, default: 'contact_form' },
  status: { type: String, default: 'new' },
  created_at: { type: String, default: () => new Date().toISOString() }
});

const AdminUser = mongoose.model('AdminUser', AdminUserSchema);
const Package = mongoose.model('Package', PackageSchema);
const Rental = mongoose.model('Rental', RentalSchema);
const Gallery = mongoose.model('Gallery', GallerySchema);
const Testimonial = mongoose.model('Testimonial', TestimonialSchema);
const Setting = mongoose.model('Setting', SettingSchema);
const Booking = mongoose.model('Booking', BookingSchema);
const AvailabilityBlock = mongoose.model('AvailabilityBlock', AvailabilityBlockSchema);
const Enquiry = mongoose.model('Enquiry', EnquirySchema);

// ─── Helpers ────────────────────────────────────────────────────────────────

// Mongoose documents carry a lot of internal machinery (_id, __v, etc) that
// the front end doesn't expect. Strip down to a plain object shaped like the
// old SQLite rows.
function plain(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  delete o._id;
  delete o.__v;
  return o;
}
function plainAll(docs) { return docs.map(plain); }

// The admin form sends itinerary/inclusions/exclusions/highlights/route_stops/
// tags as JSON-stringified text (same as it always did for the old SQLite
// text columns) — parse them into real arrays before storing as native Mongo
// arrays. Already-array input (e.g. from internal callers) passes through.
function parseArrayField(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

// ─── Seed ───────────────────────────────────────────────────────────────────

async function seed() {
  const hasAdmin = await AdminUser.findOne({ username: process.env.ADMIN_USERNAME || 'admin' });
  if (!hasAdmin) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(password, 10);
    await AdminUser.create({ id: await nextId('admin_users'), username, password_hash: hash });
  }

  const pkgCount = await Package.countDocuments();
  if (pkgCount === 0) {
    const packages = [
      {
        slug: 'meghalaya', name: 'Meghalaya Explorer', route: 'Shillong · Dawki · Cherrapunji',
        duration: '3D / 2N', group_size: '2–10 people', vehicle: 'SUV', price: null,
        image_path: 'assets/destinations/meghalaya.jpg',
        description: "A compact loop through Meghalaya's best-known stops — waterfalls, the living root bridges around Cherrapunji, and the clear waters of Dawki.",
        itinerary: [
          { day: 1, title: 'Arrive Shillong', content: 'Pickup from Guwahati airport, drive to Shillong, evening at Police Bazar and Ward\'s Lake.' },
          { day: 2, title: 'Cherrapunji', content: 'Nohkalikai Falls, Mawsmai Cave, and a walk toward the living root bridges.' },
          { day: 3, title: 'Dawki & Return', content: 'Boat ride on the Umngot river at Dawki, then drive back toward Guwahati.' }
        ],
        inclusions: ['Vehicle & experienced driver', 'Airport / station pickup & drop', 'Point-to-point transfers on the route', 'Trip planning & local guidance'],
        exclusions: ['Hotels & accommodation', 'Entry permits & fees', 'Meals & personal expenses'],
        highlights: ['Dawki river boat ride', 'Nohkalikai Falls', 'Living root bridges', 'Mawsmai Cave'],
        route_stops: [
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Airport / railway station pickup.' },
          { day: 1, name: 'Shillong', lat: 25.5788, lng: 91.8933, note: "Police Bazar & Ward's Lake." },
          { day: 2, name: 'Cherrapunji', lat: 25.2702, lng: 91.7323, note: 'Nohkalikai Falls, Mawsmai Cave, living root bridges.' },
          { day: 3, name: 'Dawki', lat: 25.1966, lng: 92.0202, note: 'Boat ride on the Umngot river, then return.' }
        ],
        featured: 1, display_order: 1
      },
      {
        slug: 'bhutan', name: 'Bhutan Escape', route: 'Paro · Thimphu · Punakha',
        duration: '5 Days', group_size: 'Small groups', vehicle: 'SUV', price: null,
        image_path: 'assets/destinations/bhutan.jpg',
        description: "A guided journey through Bhutan's western valley towns — Tiger's Nest monastery, Punakha Dzong, and the forested road between Thimphu and Paro.",
        itinerary: [
          { day: 1, title: 'Arrive Paro', content: 'Arrival at Paro airport, transfer to Thimphu. Evening walk around the capital.' },
          { day: 2, title: 'Thimphu Sightseeing', content: 'Buddha Dordenma statue, Folk Heritage Museum, Tashichho Dzong.' },
          { day: 3, title: 'Punakha Valley', content: 'Drive to Punakha. Punakha Dzong, Chimi Lhakhang fertility temple.' },
          { day: 4, title: "Tiger's Nest Trek", content: "The classic hike to Paro Taktsang (Tiger's Nest). Afternoon at leisure in Paro town." },
          { day: 5, title: 'Departure', content: 'Transfer to Paro airport for departure.' }
        ],
        inclusions: ['Vehicle & experienced driver', 'Bhutan permit assistance', 'Airport transfers', 'Point-to-point transfers'],
        exclusions: ['Bhutan visa/permit fees', 'Hotels & accommodation', 'Meals', 'Airfare'],
        highlights: ["Tiger's Nest Monastery", 'Punakha Dzong', 'Thimphu sightseeing', 'Forested mountain roads'],
        route_stops: [
          { day: 1, name: 'Paro (Arrival)', lat: 27.4287, lng: 89.4164, note: 'Arrival at Paro airport, transfer onward.' },
          { day: 1, name: 'Thimphu', lat: 27.4712, lng: 89.6339, note: 'Evening walk around the capital.' },
          { day: 2, name: 'Thimphu Sightseeing', lat: 27.4712, lng: 89.6339, note: 'Buddha Dordenma, Folk Heritage Museum, Tashichho Dzong.' },
          { day: 3, name: 'Punakha', lat: 27.5921, lng: 89.8797, note: 'Punakha Dzong, Chimi Lhakhang fertility temple.' },
          { day: 4, name: "Paro Taktsang (Tiger's Nest)", lat: 27.4915, lng: 89.3637, note: 'The classic cliffside monastery hike.' },
          { day: 5, name: 'Paro (Departure)', lat: 27.4287, lng: 89.4164, note: 'Transfer to Paro airport for departure.' }
        ],
        featured: 1, display_order: 2
      },
      {
        slug: 'sikkim', name: 'Sikkim Getaway', route: 'Gangtok · Tsomgo Lake · Monasteries',
        duration: '4 Days', group_size: '2–8 people', vehicle: 'SUV', price: null,
        image_path: 'assets/destinations/sikkim.jpg',
        description: "High-altitude Sikkim — Gangtok's monastery circuit, Tsomgo lake and Nathula pass (if open), and the Rumtek monastery.",
        itinerary: [
          { day: 1, title: 'Arrive Gangtok', content: 'Arrive from NJP / Bagdogra, transfer to Gangtok. MG Marg evening walk.' },
          { day: 2, title: 'Tsomgo Lake & Nathula', content: 'Early drive to Tsomgo Lake (3753m). Nathula Pass visit subject to permit availability.' },
          { day: 3, title: 'Monastery Circuit', content: 'Rumtek Monastery, Enchey Monastery, Do-Drul Chorten stupa.' },
          { day: 4, title: 'Return', content: 'Drive back to NJP / Bagdogra for onward journey.' }
        ],
        inclusions: ['Vehicle & experienced driver', 'Nathula permit assistance', 'Transfers throughout', 'Local guidance'],
        exclusions: ['Permits (Nathula, protected area)', 'Hotels & accommodation', 'Meals'],
        highlights: ['Tsomgo Lake at 3753m', 'Nathula Pass', 'Rumtek Monastery', 'Gangtok MG Marg'],
        route_stops: [
          { day: 1, name: 'NJP / Bagdogra (Pickup)', lat: 26.7271, lng: 88.3953, note: 'Arrival transfer up to Gangtok.' },
          { day: 1, name: 'Gangtok', lat: 27.3389, lng: 88.6065, note: 'MG Marg evening walk.' },
          { day: 2, name: 'Tsomgo Lake & Nathula', lat: 27.3747, lng: 88.7601, note: 'Glacial lake; Nathula Pass subject to permits.' },
          { day: 3, name: 'Rumtek Monastery', lat: 27.2836, lng: 88.5614, note: 'Rumtek, Enchey Monastery, Do-Drul Chorten.' },
          { day: 4, name: 'NJP / Bagdogra (Departure)', lat: 26.7271, lng: 88.3953, note: 'Drive back for onward journey.' }
        ],
        featured: 1, display_order: 3
      },
      {
        slug: 'anini', name: 'Anini Expedition', route: 'Dibang Valley · Arunachal Pradesh',
        duration: '6 Days', group_size: 'Small groups', vehicle: 'SUV', price: null,
        image_path: 'assets/destinations/anini.jpg',
        description: "One of India's most remote districts — the Dibang Valley road to Anini takes you through pristine forests, river valleys, and Adi tribal villages.",
        itinerary: [
          { day: 1, title: 'Guwahati to Roing', content: 'Long drive to Roing, the gateway to Dibang Valley. Overnight at Roing.' },
          { day: 2, title: 'Roing to Anini', content: 'Early start. The road to Anini — river crossings, forest tracks, waterfalls.' },
          { day: 3, title: 'Anini & Dibang Valley', content: 'Explore Anini town and surrounding trails. Dibang river valley walks.' },
          { day: 4, title: 'Mehao Wildlife Sanctuary', content: 'Drive toward Mehao Lake. Birdwatching and forest walks.' },
          { day: 5, title: 'Return to Roing', content: 'Drive back. Overnight at Roing.' },
          { day: 6, title: 'Roing to Guwahati', content: 'Return drive to Guwahati.' }
        ],
        inclusions: ['4WD vehicle & driver', 'ILP (Inner Line Permit) assistance', 'Transfers throughout', 'Local route planning'],
        exclusions: ['ILP fees', 'Hotels & accommodation', 'Meals', 'Personal expenses'],
        highlights: ['Dibang river valley', 'Mehao Wildlife Sanctuary', 'Anini — one of India\'s most remote towns', 'Adi tribal culture'],
        route_stops: [
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
          { day: 1, name: 'Roing', lat: 28.1409, lng: 95.8394, note: 'Gateway to Dibang Valley.' },
          { day: 2, name: 'Anini', lat: 28.8167, lng: 95.9333, note: 'River crossings, forest tracks, waterfalls en route.' },
          { day: 3, name: 'Anini & Dibang Valley', lat: 28.8167, lng: 95.9333, note: 'Local trails and river valley walks.' },
          { day: 4, name: 'Mehao Wildlife Sanctuary', lat: 28.1897, lng: 95.8536, note: 'Mehao Lake — birdwatching and forest walks.' },
          { day: 5, name: 'Roing (Return)', lat: 28.1409, lng: 95.8394, note: 'Overnight before the final leg.' },
          { day: 6, name: 'Guwahati (Drop)', lat: 26.1445, lng: 91.7362, note: 'Trip ends.' }
        ],
        featured: 1, display_order: 4
      },
      {
        slug: 'dong', name: 'Dong Valley Sunrise', route: 'Dong Valley · Arunachal Pradesh',
        duration: '5 Days', group_size: 'Small groups', vehicle: 'SUV', price: null,
        image_path: 'assets/destinations/dong.jpg',
        description: "Dong village in Anjaw district is the easternmost point of India — famous for being the first place in the country to see the sunrise. A truly off-the-beaten-path expedition.",
        itinerary: [
          { day: 1, title: 'Guwahati to Tezu', content: 'Drive to Tezu, the base for the Dong Valley route. Overnight.' },
          { day: 2, title: 'Tezu to Walong', content: 'Drive along the Lohit river to Walong, a scenic border town.' },
          { day: 3, title: 'Walong to Dong', content: 'The final stretch to Dong village. Pre-dawn preparation for the next morning.' },
          { day: 4, title: 'Sunrise at Dong', content: 'Wake before dawn to witness India\'s first sunrise. Return to Walong.' },
          { day: 5, title: 'Return to Guwahati', content: 'Long drive back to Guwahati via Tezu.' }
        ],
        inclusions: ['4WD vehicle & driver', 'ILP permit assistance', 'Transfers', 'Route planning'],
        exclusions: ['ILP fees', 'Hotels', 'Meals', 'Personal expenses'],
        highlights: ['Easternmost point of India', 'First sunrise in India', 'Lohit river valley', 'Walong war memorial'],
        route_stops: [
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
          { day: 1, name: 'Tezu', lat: 27.9167, lng: 96.1667, note: 'Base for the Dong Valley route.' },
          { day: 2, name: 'Walong', lat: 28.15, lng: 97.0167, note: 'Scenic border town along the Lohit river.' },
          { day: 3, name: 'Dong Valley', lat: 27.9333, lng: 97.4667, note: 'Final stretch to the village.' },
          { day: 4, name: 'Dong Sunrise Point', lat: 27.9333, lng: 97.4667, note: "India's first sunrise, before returning to Walong." },
          { day: 5, name: 'Guwahati (Return)', lat: 26.1445, lng: 91.7362, note: 'Long drive back via Tezu.' }
        ],
        featured: 1, display_order: 5
      },
      {
        slug: 'ziro-fest', name: 'Ziro Fest', route: 'Guwahati ↔ Ziro Valley',
        duration: '3 Days / 2 Nights', group_size: 'Limited seats', vehicle: 'SUV',
        price: '₹9,599/- onwards, per person',
        image_path: 'assets/destinations/ziro-fest.jpg',
        description: "Three days of live music under the stars in Ziro Valley — SUV transport from Guwahati, a campsite stay, and full days at one of Northeast India's best-loved outdoor music festivals. Fixed departure: 24–26 Sept 2026, seats limited.",
        itinerary: [
          { day: 1, title: 'Guwahati to Ziro', content: 'Early departure by SUV, scenic drive through Assam into the Arunachal foothills. Arrive at the festival campsite by evening and settle in.' },
          { day: 2, title: 'Ziro Fest — Full Day', content: 'A full day and night at the festival grounds — live music across genres, food stalls, and the Ziro Valley countryside by daylight.' },
          { day: 3, title: 'Return to Guwahati', content: 'Pack up camp in the morning and begin the drive back, with drop-off in Guwahati by evening.' }
        ],
        inclusions: ['SUV transportation (Guwahati ↔ Ziro ↔ Guwahati)', 'Inner Line Permit (ILP)', '2 nights campsite stay', 'Breakfast', 'Fuel & toll charges', 'Driver allowance'],
        exclusions: ['Ziro Fest entry pass (purchased separately)', 'Lunch & dinner', 'Personal expenses', 'Travel insurance'],
        highlights: ['Camp under the stars', 'Live music across 3 days', 'Fixed departure — 24–26 Sept 2026', "Ziro Valley's Apatani countryside"],
        route_stops: [
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'SUV departs for Ziro Valley.' },
          { day: 1, name: 'Ziro Valley (Campsite)', lat: 27.6, lng: 93.83, note: 'Arrive at the festival campsite, settle in for the night.' },
          { day: 2, name: 'Ziro Fest Grounds', lat: 27.6, lng: 93.83, note: 'Full day and night of live music.' },
          { day: 3, name: 'Guwahati (Return)', lat: 26.1445, lng: 91.7362, note: 'Drive back, drop-off in the evening.' }
        ],
        featured: 1, display_order: 6
      },
      {
        slug: 'kaho', name: "Kaho — India's First Village", route: 'Tezu · Hawai · Kibithu · Kaho',
        duration: '6 Days', group_size: 'Small groups', vehicle: 'SUV', price: null,
        image_path: 'assets/destinations/kaho.jpg',
        description: "Kaho, on the India-China border in Anjaw district, is the easternmost inhabited village in the country — reached via a long, spectacular drive along the Lohit river through Tezu, Hawai and Kibithu. One of the most remote expeditions we run.",
        itinerary: [
          { day: 1, title: 'Guwahati to Tezu', content: 'Long drive day toward Tezu, the last major town before the border road begins. Overnight in Tezu.' },
          { day: 2, title: 'Tezu to Hawai', content: 'Winding mountain roads along the Lohit river to Hawai, the district headquarters of Anjaw.' },
          { day: 3, title: 'Hawai to Kibithu', content: "Continue deeper along the border road to Kibithu, one of India's easternmost army posts." },
          { day: 4, title: 'Kibithu to Kaho', content: 'Final stretch to Kaho village on the Lohit river, with Chinese infrastructure visible across the border. Explore the village and checkpost area.' },
          { day: 5, title: 'Return to Hawai', content: 'Begin the long drive back toward Tezu.' },
          { day: 6, title: 'Return to Guwahati', content: 'Final leg back to Guwahati.' }
        ],
        inclusions: ['4WD vehicle & driver', 'ILP (Inner Line Permit) assistance', 'Transfers throughout', "Route planning for one of India's most remote roads"],
        exclusions: ['ILP fees', 'Hotels & homestays', 'Meals', 'Personal expenses'],
        highlights: ["India's easternmost inhabited village", 'Views across the India-China border', 'Lohit river valley road', "Declared India's official 'first village' in 2022"],
        route_stops: [
          { day: 1, name: 'Guwahati (Pickup)', lat: 26.1445, lng: 91.7362, note: 'Start point.' },
          { day: 1, name: 'Tezu', lat: 27.9167, lng: 96.1667, note: 'Last major town before the border road.' },
          { day: 2, name: 'Hawai', lat: 27.88528, lng: 96.81028, note: 'District headquarters of Anjaw.' },
          { day: 3, name: 'Kibithu', lat: 28.28028, lng: 97.01778, note: "India's easternmost army post." },
          { day: 4, name: 'Kaho', lat: 28.30361, lng: 97.02222, note: 'Easternmost inhabited village — China visible across the river.' },
          { day: 5, name: 'Hawai (Return)', lat: 27.88528, lng: 96.81028, note: 'Beginning the return journey.' },
          { day: 6, name: 'Guwahati (Drop)', lat: 26.1445, lng: 91.7362, note: 'Trip ends.' }
        ],
        featured: 1, display_order: 7
      }
    ];

    for (const p of packages) {
      await Package.create({ ...p, id: await nextId('packages') });
    }
  }

  const rentalCount = await Rental.countDocuments();
  if (rentalCount === 0) {
    const rentals = [
      { name: 'Toyota Innova Crysta', seats: '7', tags: [{ icon: 'fa-users', label: '7 seats' }, { icon: 'fa-gas-pump', label: 'Diesel' }], image_path: 'assets/rentals/innova.jpg', whatsapp: '919707386186', display_order: 1 },
      { name: 'Maruti Ertiga', seats: '7', tags: [{ icon: 'fa-users', label: '7 seats' }, { icon: 'fa-snowflake', label: 'AC' }], image_path: 'assets/rentals/ertiga.jpg', whatsapp: '919707386186', display_order: 2 },
      { name: 'Mahindra Scorpio', seats: '7', tags: [{ icon: 'fa-mountain', label: 'SUV' }, { icon: 'fa-road', label: 'Mountain-ready' }], image_path: 'assets/rentals/scorpio.jpg', whatsapp: '919707386186', display_order: 3 },
      { name: 'Swift Dzire', seats: '5', tags: [{ icon: 'fa-car', label: 'Sedan' }, { icon: 'fa-plane', label: 'Airport pickup' }], image_path: 'assets/rentals/dzire.jpg', whatsapp: '919707386186', display_order: 4 }
    ];
    for (const r of rentals) {
      await Rental.create({ ...r, id: await nextId('rentals') });
    }
  }

  const galCount = await Gallery.countDocuments();
  if (galCount === 0) {
    const gallery = [
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
    ];
    for (const g of gallery) {
      await Gallery.create({ ...g, id: await nextId('gallery') });
    }
  }

  // Testimonials are intentionally NOT seeded with placeholder data — see the
  // original SQLite version's note. They only enter via a real visitor
  // submission or a manual admin entry.

  const settingCount = await Setting.countDocuments();
  if (settingCount === 0) {
    const settings = [
      ['phone', '+91 97073 86186'],
      ['phone_raw', '+919707386186'],
      ['whatsapp', '919707386186'],
      ['email', 'tourbuddiez@gmail.com'],
      ['instagram', 'touring_buddiez'],
      ['facebook', '#'],
      ['base_location', 'Guwahati, Assam'],
      ['stat_destinations', '10'],
      ['stat_years', '2025'],
      ['stat_rating', '4.9'],
      ['site_description', 'Curated tours and reliable car rentals across Northeast India, based in Guwahati, Assam.'],
      ['response_time', 'usually within the hour']
    ];
    for (const [key, value] of settings) {
      await Setting.create({ key, value });
    }
  }
}

mongoose.connection.once('open', () => {
  seed()
    .then(() => console.log('[db] Seed check complete'))
    .catch((err) => console.error('[db] Seed error:', err.message));
});

// ─── Query helpers ─────────────────────────────────────────────────────────

module.exports = {
  // Auth
  getAdmin: (username) => AdminUser.findOne({ username }).then(plain),
  updateAdminPassword: (id, hash) => AdminUser.updateOne({ id }, { password_hash: hash }),

  // Packages
  getAllPackages: () => Package.find().sort({ display_order: 1, id: 1 }).then(plainAll),
  getFeaturedPackages: () => Package.find({ featured: 1 }).sort({ display_order: 1, id: 1 }).then(plainAll),
  getPackageBySlug: (slug) => Package.findOne({ slug }).then(plain),
  getPackageById: (id) => Package.findOne({ id }).then(plain),
  createPackage: async (data) => {
    const id = await nextId('packages');
    await Package.create({
      ...data, id,
      itinerary: parseArrayField(data.itinerary),
      inclusions: parseArrayField(data.inclusions),
      exclusions: parseArrayField(data.exclusions),
      highlights: parseArrayField(data.highlights),
      route_stops: parseArrayField(data.route_stops)
    });
    return { lastInsertRowid: id };
  },
  updatePackage: (id, data) => Package.updateOne({ id }, {
    ...data,
    itinerary: parseArrayField(data.itinerary),
    inclusions: parseArrayField(data.inclusions),
    exclusions: parseArrayField(data.exclusions),
    highlights: parseArrayField(data.highlights),
    route_stops: parseArrayField(data.route_stops)
  }),
  deletePackage: (id) => Package.deleteOne({ id }),

  // Rentals
  getAllRentals: () => Rental.find().sort({ display_order: 1, id: 1 }).then(plainAll),
  getRentalById: (id) => Rental.findOne({ id }).then(plain),
  createRental: async (data) => {
    const id = await nextId('rentals');
    return Rental.create({ ...data, id, tags: parseArrayField(data.tags) });
  },
  updateRental: (id, data) => Rental.updateOne({ id }, { ...data, tags: parseArrayField(data.tags) }),
  deleteRental: (id) => Rental.deleteOne({ id }),

  // Gallery
  getAllGallery: () => Gallery.find().sort({ display_order: 1, id: 1 }).then(plainAll),
  getGalleryById: (id) => Gallery.findOne({ id }).then(plain),
  createGalleryItem: async (data) => {
    const id = await nextId('gallery');
    return Gallery.create({ ...data, id });
  },
  updateGalleryItem: (id, data) => Gallery.updateOne({ id }, data),
  deleteGalleryItem: (id) => Gallery.deleteOne({ id }),

  // Testimonials
  getApprovedTestimonials: () => Testimonial.find({ status: 'approved' }).sort({ display_order: 1, id: -1 }).then(plainAll),
  getAllTestimonials: async () => {
    const docs = await Testimonial.find().then(plainAll);
    return docs.sort((a, b) => {
      const pendingDiff = (b.status === 'pending') - (a.status === 'pending');
      return pendingDiff !== 0 ? pendingDiff : b.id - a.id;
    });
  },
  getTestimonialById: (id) => Testimonial.findOne({ id }).then(plain),
  submitTestimonial: async (data) => {
    const id = await nextId('testimonials');
    return Testimonial.create({ ...data, id, display_order: 0, status: 'pending', created_at: new Date().toISOString() });
  },
  createTestimonial: async (data) => {
    const id = await nextId('testimonials');
    return Testimonial.create({ ...data, id, status: 'approved', created_at: new Date().toISOString() });
  },
  updateTestimonial: (id, data) => Testimonial.updateOne({ id }, data),
  setTestimonialStatus: (id, status) => Testimonial.updateOne({ id }, { status }),
  deleteTestimonial: (id) => Testimonial.deleteOne({ id }),

  // Settings
  getAllSettings: async () => {
    const rows = await Setting.find();
    const out = {};
    rows.forEach(r => out[r.key] = r.value);
    return out;
  },
  getSetting: async (key) => {
    const r = await Setting.findOne({ key });
    return r ? r.value : null;
  },
  setSetting: (key, value) => Setting.updateOne({ key }, { value }, { upsert: true }),

  // Bookings
  createBooking: async (data) => {
    const id = await nextId('bookings');
    await Booking.create({ ...data, id, status: 'pending', created_at: new Date().toISOString() });
    return { lastInsertRowid: id };
  },
  getAllBookings: async () => {
    const docs = await Booking.find().then(plainAll);
    return docs.sort((a, b) => {
      const pendingDiff = (b.status === 'pending') - (a.status === 'pending');
      return pendingDiff !== 0 ? pendingDiff : b.id - a.id;
    });
  },
  getBookingById: (id) => Booking.findOne({ id }).then(plain),
  setBookingStatus: (id, status) => Booking.updateOne({ id }, { status }),
  deleteBooking: (id) => Booking.deleteOne({ id }),

  // Enquiries
  createEnquiry: async (data) => {
    const id = await nextId('enquiries');
    await Enquiry.create({ ...data, id, status: 'new', created_at: new Date().toISOString() });
    return { lastInsertRowid: id };
  },
  getAllEnquiries: async () => {
    const docs = await Enquiry.find().then(plainAll);
    return docs.sort((a, b) => {
      const newDiff = (b.status === 'new') - (a.status === 'new');
      return newDiff !== 0 ? newDiff : b.id - a.id;
    });
  },
  getEnquiryById: (id) => Enquiry.findOne({ id }).then(plain),
  setEnquiryStatus: (id, status) => Enquiry.updateOne({ id }, { status }),
  deleteEnquiry: (id) => Enquiry.deleteOne({ id }),

  // ─── Availability blocks ──────────────────────────────────────────────────
  getAvailabilityBySlug: (slug) => AvailabilityBlock.find({ package_slug: slug }).sort({ start_date: 1 }).then(plainAll),

  getAllAvailability: async () => {
    const blocks = await AvailabilityBlock.find().sort({ start_date: 1 }).then(plainAll);
    const slugs = [...new Set(blocks.map(b => b.package_slug))];
    const pkgs = await Package.find({ slug: { $in: slugs } });
    const nameBySlug = {};
    pkgs.forEach(p => nameBySlug[p.slug] = p.name);
    return blocks.map(b => ({ ...b, package_name: nameBySlug[b.package_slug] || null }));
  },

  createAvailabilityBlock: async (data) => {
    const id = await nextId('availability_blocks');
    await AvailabilityBlock.create({ ...data, id, created_at: new Date().toISOString() });
    return { lastInsertRowid: id };
  },

  deleteAvailabilityBlock: (id) => AvailabilityBlock.deleteOne({ id }),

  // Stats (for the admin analytics dashboard)
  getStats: async () => {
    const packages = await Package.countDocuments();
    const bookings = await Booking.countDocuments();
    const bookingsPending = await Booking.countDocuments({ status: 'pending' });
    const bookingsConfirmed = await Booking.countDocuments({ status: 'confirmed' });
    const bookingsCancelled = await Booking.countDocuments({ status: 'cancelled' });
    const enquiries = await Enquiry.countDocuments();
    const enquiriesNew = await Enquiry.countDocuments({ status: 'new' });
    const enquiriesClosed = await Enquiry.countDocuments({ status: 'closed' });
    const testimonialsPending = await Testimonial.countDocuments({ status: 'pending' });

    const allBookings = await Booking.find();
    const allEnquiries = await Enquiry.find();

    // Most-booked package
    const bookingCounts = {};
    allBookings.forEach(b => {
      if (b.package_name) bookingCounts[b.package_name] = (bookingCounts[b.package_name] || 0) + 1;
    });
    const mostBookedEntry = Object.entries(bookingCounts).sort((a, b) => b[1] - a[1])[0];
    const mostBookedPackage = mostBookedEntry ? mostBookedEntry[0] : null;

    // Bookings by day, last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const byDay = {};
    allBookings
      .filter(b => new Date(b.created_at) >= thirtyDaysAgo)
      .forEach(b => {
        const day = (b.created_at || '').slice(0, 10);
        byDay[day] = (byDay[day] || 0) + 1;
      });
    const bookingsByDay = Object.entries(byDay)
      .map(([day, c]) => ({ day, c }))
      .sort((a, b) => a.day.localeCompare(b.day));

    // Package popularity — bookings + enquiries combined, ranked
    const popularity = {};
    allBookings.forEach(b => { if (b.package_name) popularity[b.package_name] = (popularity[b.package_name] || 0) + 1; });
    allEnquiries.forEach(e => { if (e.package_name) popularity[e.package_name] = (popularity[e.package_name] || 0) + 1; });
    const packagePopularity = Object.entries(popularity)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Recent activity feed
    const recentBookings = allBookings
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8)
      .map(b => ({ type: 'booking', id: b.id, name: b.name, package_name: b.package_name, status: b.status, created_at: b.created_at }));
    const recentEnquiries = allEnquiries
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8)
      .map(e => ({ type: 'enquiry', id: e.id, name: e.name, package_name: e.package_name, status: e.status, created_at: e.created_at }));
    const recentActivity = [...recentBookings, ...recentEnquiries]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8);

    return {
      packages, bookings, bookingsPending, bookingsConfirmed, bookingsCancelled,
      enquiries, enquiriesNew, enquiriesClosed, testimonialsPending,
      mostBookedPackage, bookingsByDay, packagePopularity, recentActivity
    };
  }
};
