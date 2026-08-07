const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);

// Ensure uploads directory exists
// DATA_DIR lets production hosts (Render, Railway, etc.) point uploads at a
// persistent disk mount instead of the app's own folder — anything written
// outside a mounted disk gets wiped on every redeploy on most hosts. Locally,
// with no DATA_DIR set, this just uses the project folder as before.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Basic security headers (no extra dependency) ─────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ─── Block access to sensitive files/directories ──────────────────────────────
// express.static(__dirname) below serves the whole project root so the site's
// existing relative paths (css/, js/, assets/) keep working without a rewrite.
// That means anything else in the project root is reachable by URL unless we
// explicitly deny it first — critically the SQLite database (customer PII +
// the admin's password hash), the server source, and deploy/config files.
const DENIED_PATHS = [
  '/db', '/server.js', '/package.json', '/package-lock.json',
  '/.replit', '/replit.nix', '/replit.md', '/.env', '/.git', '/node_modules'
];
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  const blocked = DENIED_PATHS.some(denied => p === denied || p.startsWith(denied + '/'));
  if (blocked) return res.status(404).end();
  next();
});

// ─── Legacy static package pages → dynamic package-detail.html ────────────────
// These destinations used to ship as standalone HTML files (package-meghalaya.html
// etc). They've been superseded by the DB-driven package-detail.html?slug=X page,
// which is what every internal link now points to — this keeps admin-edited
// content (via the Package Manager) always in sync instead of drifting out of
// sync with hand-written static HTML. The 301s below exist only so any old
// bookmarks / already-indexed search results / inbound links still land on the
// right (single, canonical) page instead of a 404 or duplicate content.
const LEGACY_PACKAGE_REDIRECTS = {
  '/package-meghalaya.html': 'meghalaya',
  '/package-bhutan.html': 'bhutan',
  '/package-sikkim.html': 'sikkim',
  '/package-anini.html': 'anini',
  '/package-dong.html': 'dong',
  '/package-ziro-fest.html': 'ziro-fest',
  '/package-kaho.html': 'kaho'
};
app.get(Object.keys(LEGACY_PACKAGE_REDIRECTS), (req, res) => {
  const slug = LEGACY_PACKAGE_REDIRECTS[req.path];
  res.redirect(301, `/package-detail.html?slug=${slug}`);
});

app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

if (!process.env.SESSION_SECRET) {
  console.warn(
    '\n[SECURITY WARNING] SESSION_SECRET is not set — falling back to a ' +
    'default value that is visible in the source code. Set a SESSION_SECRET ' +
    'environment variable before deploying to production.\n'
  );
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'touring-buddiez-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// ─── Multer ────────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
                allowed.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only image files are allowed'));
  }
});

// ─── Auth middleware ───────────────────────────────────────────────────────────

const requireAuth = (req, res, next) => {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// ─── Login rate limiting (in-memory, no extra dependency) ─────────────────────
// Blunts brute-force password guessing against /api/auth/login. Per-process
// memory is fine for a single-instance deploy like this one; if this app is
// ever scaled to multiple instances, swap this for a shared store (Redis etc).
const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map(); // ip -> { count, firstAttempt }

function loginRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return next();
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((LOGIN_WINDOW_MS - (now - entry.firstAttempt)) / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  entry.count += 1;
  next();
}

// Periodically clear old entries so this Map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.firstAttempt > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
}, LOGIN_WINDOW_MS).unref();

// ─── Auth routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const admin = db.getAdmin(username);
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.admin = { id: admin.id, username: admin.username };
    res.json({ ok: true, username: admin.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/check', (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.admin),
    username: req.session?.admin?.username || null
  });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const admin = db.getAdmin(req.session.admin.username);
    const ok = await bcrypt.compare(current_password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const hash = await bcrypt.hash(new_password, 10);
    db.updateAdminPassword(admin.id, hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Packages ─────────────────────────────────────────────────────────────────

app.get('/api/packages', (req, res) => {
  const featured = req.query.featured === 'true';
  res.json(featured ? db.getFeaturedPackages() : db.getAllPackages());
});

app.get('/api/packages/:slug', (req, res) => {
  const pkg = db.getPackageBySlug(req.params.slug);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  res.json(pkg);
});

app.post('/api/packages', requireAuth, upload.single('image'), (req, res) => {
  try {
    const { slug, name, route, duration, group_size, vehicle, price, description,
            itinerary, inclusions, exclusions, highlights, route_stops, featured, display_order } = req.body;

    if (!slug || !name) return res.status(400).json({ error: 'Slug and name are required' });

    let image_path = req.body.existing_image || '';
    if (req.file) image_path = 'uploads/' + req.file.filename;

    const data = {
      slug: slug.toLowerCase().replace(/\s+/g, '-'),
      name, route, duration, group_size, vehicle, price, image_path, description,
      itinerary: itinerary || '[]',
      inclusions: inclusions || '[]',
      exclusions: exclusions || '[]',
      highlights: highlights || '[]',
      route_stops: route_stops || '[]',
      featured: featured === 'true' || featured === '1' ? 1 : 0,
      display_order: parseInt(display_order) || 0
    };

    const result = db.createPackage(data);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Create package error:', err);
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'A package with this slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/packages/:id', requireAuth, upload.single('image'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = db.getPackageById(id);
    if (!existing) return res.status(404).json({ error: 'Package not found' });

    const { slug, name, route, duration, group_size, vehicle, price, description,
            itinerary, inclusions, exclusions, highlights, route_stops, featured, display_order } = req.body;

    let image_path = req.body.existing_image || existing.image_path;
    if (req.file) image_path = 'uploads/' + req.file.filename;

    const data = {
      slug: slug.toLowerCase().replace(/\s+/g, '-'),
      name, route, duration, group_size, vehicle, price, image_path, description,
      itinerary: itinerary || '[]',
      inclusions: inclusions || '[]',
      exclusions: exclusions || '[]',
      highlights: highlights || '[]',
      route_stops: route_stops || '[]',
      featured: featured === 'true' || featured === '1' ? 1 : 0,
      display_order: parseInt(display_order) || 0
    };

    db.updatePackage(id, data);
    res.json({ ok: true });
  } catch (err) {
    console.error('Update package error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/packages/:id', requireAuth, (req, res) => {
  try {
    db.deletePackage(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Rentals ──────────────────────────────────────────────────────────────────

app.get('/api/rentals', (req, res) => res.json(db.getAllRentals()));

app.post('/api/rentals', requireAuth, upload.single('image'), (req, res) => {
  try {
    const { name, seats, tags, whatsapp, display_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    let image_path = req.body.existing_image || '';
    if (req.file) image_path = 'uploads/' + req.file.filename;

    db.createRental({
      name, seats, tags: tags || '[]', image_path,
      whatsapp: whatsapp || db.getSetting('whatsapp') || '916002816370',
      display_order: parseInt(display_order) || 0
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/rentals/:id', requireAuth, upload.single('image'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = db.getRentalById(id);
    if (!existing) return res.status(404).json({ error: 'Rental not found' });

    const { name, seats, tags, whatsapp, display_order } = req.body;
    let image_path = req.body.existing_image || existing.image_path;
    if (req.file) image_path = 'uploads/' + req.file.filename;

    db.updateRental(id, {
      name, seats, tags: tags || '[]', image_path,
      whatsapp: whatsapp || existing.whatsapp,
      display_order: parseInt(display_order) || 0
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rentals/:id', requireAuth, (req, res) => {
  try {
    db.deleteRental(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Gallery ──────────────────────────────────────────────────────────────────

app.get('/api/gallery', (req, res) => res.json(db.getAllGallery()));

app.post('/api/gallery', requireAuth, upload.array('images', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No images uploaded' });

    const { alt_text, is_tall } = req.body;
    let order = db.getAllGallery().length;

    req.files.forEach(file => {
      db.createGalleryItem({
        image_path: 'uploads/' + file.filename,
        alt_text: alt_text || 'Travel photo from Northeast India',
        is_tall: is_tall === 'true' || is_tall === '1' ? 1 : 0,
        display_order: ++order
      });
    });

    res.json({ ok: true, count: req.files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/gallery/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { alt_text, is_tall, display_order } = req.body;
    db.updateGalleryItem(id, {
      alt_text: alt_text || '',
      is_tall: is_tall === 'true' || is_tall === '1' ? 1 : 0,
      display_order: parseInt(display_order) || 0
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/gallery/:id', requireAuth, (req, res) => {
  try {
    const item = db.getGalleryById(parseInt(req.params.id));
    if (item && item.image_path.startsWith('uploads/')) {
      const fullPath = path.join(DATA_DIR, item.image_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    db.deleteGalleryItem(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Testimonials ─────────────────────────────────────────────────────────────

// Public homepage feed — approved reviews only. Never seeded, never faked.
app.get('/api/testimonials', (req, res) => res.json(db.getApprovedTestimonials()));

// Admin moderation queue — every submission, pending first.
app.get('/api/testimonials/all', requireAuth, (req, res) => res.json(db.getAllTestimonials()));

// A real visitor submitting the "Write a Review" form on the site.
// Goes in as pending — nothing reaches the public page until an admin approves it.
const testimonialSubmitTimestamps = new Map();
app.post('/api/testimonials/submit', (req, res) => {
  try {
    const { name, package_name, quote, rating, email, website } = req.body;

    // Honeypot: real visitors never see or fill this field.
    if (website) return res.json({ ok: true });

    if (!name || !name.trim() || !quote || !quote.trim()) {
      return res.status(400).json({ error: 'Please add your name and a few words about your trip.' });
    }
    if (quote.trim().length > 1000) {
      return res.status(400).json({ error: 'Review is too long — please keep it under 1000 characters.' });
    }

    // Very light throttling per IP so the queue can't be spammed.
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const last = testimonialSubmitTimestamps.get(ip);
    if (last && Date.now() - last < 60 * 1000) {
      return res.status(429).json({ error: 'Please wait a moment before submitting another review.' });
    }
    testimonialSubmitTimestamps.set(ip, Date.now());

    db.submitTestimonial({
      name: name.trim().slice(0, 100),
      package_name: (package_name || '').trim().slice(0, 100),
      quote: quote.trim().slice(0, 1000),
      rating: Math.min(5, Math.max(1, parseInt(rating) || 5)),
      email: (email || '').trim().slice(0, 200)
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin manually logging a review collected another way (phone, WhatsApp, etc). Goes live immediately.
app.post('/api/testimonials', requireAuth, (req, res) => {
  try {
    const { name, package_name, quote, rating, display_order, email } = req.body;
    if (!name || !quote) return res.status(400).json({ error: 'Name and quote are required' });
    db.createTestimonial({ name, package_name, quote, rating: parseInt(rating) || 5, display_order: parseInt(display_order) || 0, email: email || '' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/testimonials/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, package_name, quote, rating, display_order } = req.body;
    db.updateTestimonial(id, { name, package_name, quote, rating: parseInt(rating) || 5, display_order: parseInt(display_order) || 0 });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve or reject a pending review.
app.patch('/api/testimonials/:id/status', requireAuth, (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'pending', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    db.setTestimonialStatus(parseInt(req.params.id), status);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/testimonials/:id', requireAuth, (req, res) => {
  try {
    db.deleteTestimonial(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Bookings ─────────────────────────────────────────────────────────────────

// A visitor submitting the "Book This Trip" form on a package page.
// Goes in as pending — an admin confirms it (and reaches out) from the dashboard.
const bookingSubmitTimestamps = new Map();
app.post('/api/bookings', (req, res) => {
  try {
    const { name, phone, email, package_slug, package_name, travel_date, group_size, message, website } = req.body;

    // Honeypot: real visitors never see or fill this field.
    if (website) return res.json({ ok: true });

    if (!name || !name.trim() || !phone || !phone.trim()) {
      return res.status(400).json({ error: 'Please add your name and phone number.' });
    }

    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const last = bookingSubmitTimestamps.get(ip);
    if (last && Date.now() - last < 30 * 1000) {
      return res.status(429).json({ error: 'Please wait a moment before submitting again.' });
    }
    bookingSubmitTimestamps.set(ip, Date.now());

    const result = db.createBooking({
      name: name.trim().slice(0, 100),
      phone: phone.trim().slice(0, 30),
      email: (email || '').trim().slice(0, 200),
      package_slug: (package_slug || '').trim().slice(0, 100),
      package_name: (package_name || '').trim().slice(0, 150),
      travel_date: (travel_date || '').trim().slice(0, 50),
      group_size: (group_size || '').trim().slice(0, 50),
      message: (message || '').trim().slice(0, 1000)
    });
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings', requireAuth, (req, res) => res.json(db.getAllBookings()));

app.patch('/api/bookings/:id/status', requireAuth, (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    db.setBookingStatus(parseInt(req.params.id), status);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/bookings/:id', requireAuth, (req, res) => {
  try {
    db.deleteBooking(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Enquiries ────────────────────────────────────────────────────────────────

// The homepage contact form. Saved here first so nothing is lost even if the
// visitor's WhatsApp tap never actually sends (or they don't have it installed).
const enquirySubmitTimestamps = new Map();
app.post('/api/enquiries', (req, res) => {
  try {
    const { name, phone, email, message, source, website } = req.body;

    if (website) return res.json({ ok: true });

    if (!name || !name.trim() || !message || !message.trim()) {
      return res.status(400).json({ error: 'Please add your name and a short message.' });
    }

    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const last = enquirySubmitTimestamps.get(ip);
    if (last && Date.now() - last < 30 * 1000) {
      return res.status(429).json({ error: 'Please wait a moment before submitting again.' });
    }
    enquirySubmitTimestamps.set(ip, Date.now());

    const result = db.createEnquiry({
      name: name.trim().slice(0, 100),
      phone: (phone || '').trim().slice(0, 30),
      email: (email || '').trim().slice(0, 200),
      message: message.trim().slice(0, 1000),
      source: (source || 'contact_form').trim().slice(0, 50)
    });
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/enquiries', requireAuth, (req, res) => res.json(db.getAllEnquiries()));

app.patch('/api/enquiries/:id/status', requireAuth, (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['new', 'replied', 'closed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    db.setEnquiryStatus(parseInt(req.params.id), status);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/enquiries/:id', requireAuth, (req, res) => {
  try {
    db.deleteEnquiry(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────────

app.get('/api/stats', requireAuth, (req, res) => {
  try {
    res.json(db.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => res.json(db.getAllSettings()));

app.put('/api/settings', requireAuth, (req, res) => {
  try {
    const allowed = ['phone', 'phone_raw', 'whatsapp', 'instagram', 'facebook',
                     'base_location', 'stat_destinations', 'stat_travelers',
                     'stat_years', 'stat_rating', 'site_description', 'response_time'];
    allowed.forEach(key => {
      if (req.body[key] !== undefined) db.setSetting(key, req.body[key]);
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin panel ───────────────────────────────────────────────────────────────

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
app.get('/admin/', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Touring Buddiez running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
