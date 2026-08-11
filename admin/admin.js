/* ============================================================
   TOURING BUDDIEZ — ADMIN PANEL JAVASCRIPT
   ============================================================ */

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
let currentSection = 'dashboard';
let allPackages = [], allRentals = [], allGallery = [], allTestimonials = [];
let allBookings = [], allEnquiries = [];
let editingPackageId = null, editingRentalId = null, editingTestimonialId = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { authenticated, username } = await api('GET', '/api/auth/check');
  if (authenticated) {
    showApp(username);
  }
  // else login screen is already visible

  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const err = document.getElementById('login-error');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;
    err.style.display = 'none';

    try {
      const res = await api('POST', '/api/auth/login', {
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value
      });
      if (res.ok) showApp(res.username);
      else throw new Error(res.error || 'Login failed');
    } catch (ex) {
      err.textContent = ex.message;
      err.style.display = 'block';
      btn.innerHTML = 'Sign In';
      btn.disabled = false;
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('POST', '/api/auth/logout');
    location.reload();
  });

  // Sidebar nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      showSection(el.dataset.section);
      closeSidebarMobile();
    });
  });

  // Mobile sidebar toggle
  document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebarMobile);

  // Settings form
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const msg = document.getElementById('settings-msg');
    try {
      await api('PUT', '/api/settings', data);
      msg.textContent = '✓ Settings saved successfully!';
      msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 3000);
      toast('Settings saved!');
    } catch (ex) {
      toast('Error: ' + ex.message, true);
    }
  });

  // Password form
  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = document.getElementById('cur-pass').value;
    const nw = document.getElementById('new-pass').value;
    const conf = document.getElementById('conf-pass').value;
    const msg = document.getElementById('pass-msg');

    if (nw !== conf) { msg.textContent = 'New passwords do not match.'; msg.style.color = 'var(--danger)'; msg.style.display = 'block'; return; }

    try {
      await api('POST', '/api/auth/change-password', { current_password: cur, new_password: nw });
      msg.textContent = '✓ Password changed successfully!';
      msg.style.color = 'var(--success)';
      msg.style.display = 'block';
      e.target.reset();
      toast('Password changed!');
    } catch (ex) {
      msg.textContent = ex.message;
      msg.style.color = 'var(--danger)';
      msg.style.display = 'block';
    }
  });
});

function showApp(username) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('topbar-username').textContent = username || 'admin';
  showSection('dashboard');
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function showSection(name) {
  currentSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById('section-' + name);
  if (section) section.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (navItem) navItem.classList.add('active');

  const titles = {
    dashboard: 'Dashboard', packages: 'Tour Packages', bookings: 'Bookings', enquiries: 'Enquiries',
    rentals: 'Rental Vehicles', availability: 'Package Availability', gallery: 'Gallery', testimonials: 'Testimonials',
    settings: 'Site Settings', account: 'Change Password'
  };
  document.getElementById('topbar-title').textContent = titles[name] || name;

  // Load data for section
  if (name === 'dashboard') loadDashboard();
  else if (name === 'packages') loadPackages();
  else if (name === 'bookings') loadBookings();
  else if (name === 'enquiries') loadEnquiries();
  else if (name === 'rentals') loadRentals();
  else if (name === 'availability') loadAvailability();
  else if (name === 'gallery') loadGallery();
  else if (name === 'testimonials') loadTestimonials();
  else if (name === 'settings') loadSettings();
}

// ─── Mobile sidebar ───────────────────────────────────────────────────────────
function toggleSidebarMobile() {
  document.querySelector('.sidebar').classList.toggle('open');
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebarMobile);
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle('visible');
}
function closeSidebarMobile() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('visible');
}

// ─── API helper ───────────────────────────────────────────────────────────────
async function api(method, url, data, isFormData = false) {
  const opts = { method, headers: {} };
  if (data) {
    if (isFormData) {
      opts.body = data;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }
  }
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = isError ? 'error' : '';
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.display = 'none', 3000);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-body').innerHTML = '';
  editingPackageId = null;
  editingRentalId = null;
  editingTestimonialId = null;
}
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [pkgs, rentals, gallery, tests, stats] = await Promise.all([
      api('GET', '/api/packages'),
      api('GET', '/api/rentals'),
      api('GET', '/api/gallery'),
      api('GET', '/api/testimonials/all'),
      api('GET', '/api/stats')
    ]);
    document.getElementById('stat-packages').textContent = pkgs.length;
    document.getElementById('stat-rentals').textContent = rentals.length;
    document.getElementById('stat-gallery').textContent = gallery.length;
    document.getElementById('stat-testimonials').textContent = tests.filter(t => t.status === 'approved').length;
    document.getElementById('stat-bookings').textContent = stats.bookings;
    document.getElementById('stat-enquiries').textContent = stats.enquiries;
    document.getElementById('stat-most-booked').textContent = stats.mostBookedPackage
      ? `Most booked: ${stats.mostBookedPackage}` : '';
    updateTestimonialBadge(tests);
    updateBookingBadge(stats.bookingsPending);
    updateEnquiryBadge(stats.enquiriesNew);
    renderBookingsChart(stats.bookingsByDay);
    renderStatusBreakdown(stats);
    renderPackagePopularity(stats.packagePopularity);
    renderRecentActivity(stats.recentActivity);
  } catch (ex) { console.error(ex); }
}

function renderStatusBreakdown(stats) {
  const el = document.getElementById('status-breakdown');
  if (!el) return;
  el.innerHTML = `
    <div class="status-breakdown-group">
      <h4>Bookings</h4>
      <div class="status-breakdown-pills">
        <span class="status-breakdown-pill pending"><b>${stats.bookingsPending}</b> Pending</span>
        <span class="status-breakdown-pill confirmed"><b>${stats.bookingsConfirmed}</b> Confirmed</span>
        <span class="status-breakdown-pill cancelled"><b>${stats.bookingsCancelled}</b> Cancelled</span>
      </div>
    </div>
    <div class="status-breakdown-group">
      <h4>Enquiries</h4>
      <div class="status-breakdown-pills">
        <span class="status-breakdown-pill new"><b>${stats.enquiriesNew}</b> New</span>
        <span class="status-breakdown-pill closed"><b>${stats.enquiriesClosed}</b> Closed</span>
      </div>
    </div>
  `;
}

function renderPackagePopularity(rows) {
  const el = document.getElementById('package-popularity');
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = '<p class="dash-panel-empty">No bookings or enquiries linked to packages yet.</p>';
    return;
  }
  const max = Math.max(...rows.map(r => r.count), 1);
  el.innerHTML = rows.map(r => `
    <div class="popularity-row">
      <span class="popularity-name">${esc(r.name)}</span>
      <span class="popularity-count">${r.count}</span>
      <div class="popularity-bar-track"><div class="popularity-bar-fill" style="width:${Math.round((r.count / max) * 100)}%"></div></div>
    </div>
  `).join('');
}

function renderRecentActivity(rows) {
  const el = document.getElementById('recent-activity');
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = '<p class="dash-panel-empty">No bookings or enquiries yet.</p>';
    return;
  }
  el.innerHTML = rows.map(r => {
    const isBooking = r.type === 'booking';
    const verb = isBooking ? 'booked' : 'enquired about';
    const pkg = r.package_name ? ` <b>${esc(r.package_name)}</b>` : '';
    const when = new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="activity-row">
        <div class="activity-icon ${isBooking ? 'booking' : 'enquiry'}">
          <i class="fa-solid ${isBooking ? 'fa-calendar-check' : 'fa-envelope'}"></i>
        </div>
        <div class="activity-body">
          <div class="activity-title">${esc(r.name || 'Someone')} ${verb}${pkg}</div>
          <div class="activity-meta">${when} &middot; <span class="status-pill ${esc(r.status)}">${esc(r.status)}</span></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderBookingsChart(byDay) {
  const el = document.getElementById('bookings-chart');
  if (!el) return;
  if (!byDay || !byDay.length) {
    el.innerHTML = '<p class="dash-panel-empty">No bookings yet in the last 30 days.</p>';
    return;
  }
  const max = Math.max(...byDay.map(d => d.c), 1);
  el.innerHTML = byDay.map(d => {
    const pct = Math.round((d.c / max) * 100);
    const label = new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `<div class="bar-col" title="${d.c} booking${d.c === 1 ? '' : 's'} on ${label}">
      <div class="bar-fill" style="height:${Math.max(pct, 6)}%"><span>${d.c}</span></div>
      <div class="bar-label">${label}</div>
    </div>`;
  }).join('');
}

function updateTestimonialBadge(tests) {
  const badge = document.getElementById('testimonials-pending-badge');
  if (!badge) return;
  const pending = tests.filter(t => t.status === 'pending').length;
  badge.textContent = pending;
  badge.style.display = pending ? 'flex' : 'none';
}

function updateBookingBadge(pending) {
  const badge = document.getElementById('bookings-pending-badge');
  if (!badge) return;
  badge.textContent = pending;
  badge.style.display = pending ? 'flex' : 'none';
}

function updateEnquiryBadge(newCount) {
  const badge = document.getElementById('enquiries-new-badge');
  if (!badge) return;
  badge.textContent = newCount;
  badge.style.display = newCount ? 'flex' : 'none';
}

// ─── PACKAGES ─────────────────────────────────────────────────────────────────
async function loadPackages() {
  try {
    allPackages = await api('GET', '/api/packages');
    renderPackagesTable();
  } catch (ex) { toast('Failed to load packages', true); }
}

function renderPackagesTable() {
  const tbody = document.getElementById('packages-tbody');
  if (!allPackages.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--slate-300)">No packages yet. Add your first one!</td></tr>';
    return;
  }
  tbody.innerHTML = allPackages.map(p => `
    <tr>
      <td>${p.image_path ? `<img class="table-thumb" src="/${p.image_path}" alt="${p.name}" onerror="this.style.display='none'">` : '<div class="table-thumb-placeholder"><i class="fa-solid fa-image"></i></div>'}</td>
      <td><strong>${esc(p.name)}</strong><br><small style="color:var(--slate-500)">${esc(p.slug)}</small></td>
      <td>${esc(p.route || '–')}</td>
      <td>${esc(p.duration || '–')}</td>
      <td><span class="${p.featured ? 'badge-yes' : 'badge-no'}">${p.featured ? 'Yes' : 'No'}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn-edit" onclick="editPackage(${p.id})"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn-danger" onclick="deletePackage(${p.id}, '${esc(p.name)}')"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openPackageForm(pkg = null) {
  editingPackageId = pkg ? pkg.id : null;
  const title = pkg ? 'Edit Package' : 'Add New Package';

  const itin = pkg?.itinerary || [];
  const incl = pkg?.inclusions || [];
  const excl = pkg?.exclusions || [];
  const high = pkg?.highlights || [];
  const stops = pkg?.route_stops || [];

  const html = `
    <form id="pkg-form">
      <div class="form-section">
        <h4>Basic Info</h4>
        <div class="field-row">
          <div class="field">
            <label for="fld-name">Package Name *</label>
            <input id="fld-name" type="text" name="name" value="${esc(pkg?.name || '')}" required placeholder="e.g. Meghalaya Explorer">
          </div>
          <div class="field">
            <label for="fld-slug">URL Slug *</label>
            <input id="fld-slug" type="text" name="slug" value="${esc(pkg?.slug || '')}" required placeholder="e.g. meghalaya">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="fld-route">Route</label>
            <input id="fld-route" type="text" name="route" value="${esc(pkg?.route || '')}" placeholder="Shillong · Dawki · Cherrapunji">
          </div>
          <div class="field">
            <label for="fld-duration">Duration</label>
            <input id="fld-duration" type="text" name="duration" value="${esc(pkg?.duration || '')}" placeholder="3D / 2N">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="fld-group_size">Group Size</label>
            <input id="fld-group_size" type="text" name="group_size" value="${esc(pkg?.group_size || '')}" placeholder="2–10 people">
          </div>
          <div class="field">
            <label for="fld-vehicle">Vehicle</label>
            <input id="fld-vehicle" type="text" name="vehicle" value="${esc(pkg?.vehicle || '')}" placeholder="SUV">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="fld-price">Starting Price (optional)</label>
            <input id="fld-price" type="text" name="price" value="${esc(pkg?.price || '')}" placeholder="e.g. ₹9,599/- per person — leave blank for quote-on-request">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="fld-display_order">Display Order</label>
            <input id="fld-display_order" type="number" name="display_order" value="${pkg?.display_order || 0}" min="0">
          </div>
          <div class="field" style="display:flex;align-items:flex-end;gap:.6rem;padding-bottom:.1rem">
            <input type="checkbox" name="featured" id="pkg-featured" value="true" ${pkg?.featured ? 'checked' : ''}>
            <label for="pkg-featured" style="text-transform:none;letter-spacing:0;font-size:.9rem;font-weight:500;color:var(--slate-700);cursor:pointer">Show on homepage</label>
          </div>
        </div>
      </div>

      <div class="form-section">
        <h4>Description</h4>
        <div class="field">
          <label for="fld-description">Overview Paragraph</label>
          <textarea id="fld-description" name="description" rows="3" placeholder="Brief description of the package...">${esc(pkg?.description || '')}</textarea>
        </div>
      </div>

      <div class="form-section">
        <h4>Package Image</h4>
        ${pkg?.image_path ? `<div class="current-image-wrap"><img src="/${pkg.image_path}" alt="Current image"></div>` : ''}
        <div class="upload-zone" id="pkg-img-zone" onclick="document.getElementById('pkg-img-input').click()">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <p>${pkg?.image_path ? 'Click to replace image' : 'Click to upload image'}<br><small>JPG, PNG, WebP — max 15MB</small></p>
          <input type="file" id="pkg-img-input" accept="image/*">
        </div>
        <div class="image-preview" id="pkg-img-preview"></div>
        <input type="hidden" name="existing_image" value="${esc(pkg?.image_path || '')}">
      </div>

      <div class="form-section">
        <button type="button" class="collapse-toggle" onclick="toggleCollapse('itin-body', this)">
          <i class="fa-solid fa-chevron-right"></i> Itinerary (${itin.length} days)
        </button>
        <div class="collapse-body" id="itin-body">
          <div class="itinerary-editor" id="itin-editor">
            ${itin.map((d, i) => itinDayHtml(i, d.title, d.content)).join('')}
          </div>
          <button type="button" class="list-editor-add" onclick="addItinDay()"><i class="fa-solid fa-plus"></i> Add Day</button>
        </div>
      </div>

      <div class="form-section">
        <button type="button" class="collapse-toggle" onclick="toggleCollapse('incl-body', this)">
          <i class="fa-solid fa-chevron-right"></i> Inclusions (${incl.length})
        </button>
        <div class="collapse-body" id="incl-body">
          <div class="list-editor" id="incl-editor">
            <div class="list-editor-items" id="incl-items">
              ${incl.map((item, i) => listItemHtml('incl', i, item)).join('')}
            </div>
            <button type="button" class="list-editor-add" onclick="addListItem('incl')"><i class="fa-solid fa-plus"></i> Add inclusion</button>
          </div>
        </div>
      </div>

      <div class="form-section">
        <button type="button" class="collapse-toggle" onclick="toggleCollapse('excl-body', this)">
          <i class="fa-solid fa-chevron-right"></i> Exclusions (${excl.length})
        </button>
        <div class="collapse-body" id="excl-body">
          <div class="list-editor" id="excl-editor">
            <div class="list-editor-items" id="excl-items">
              ${excl.map((item, i) => listItemHtml('excl', i, item)).join('')}
            </div>
            <button type="button" class="list-editor-add" onclick="addListItem('excl')"><i class="fa-solid fa-plus"></i> Add exclusion</button>
          </div>
        </div>
      </div>

      <div class="form-section">
        <button type="button" class="collapse-toggle" onclick="toggleCollapse('high-body', this)">
          <i class="fa-solid fa-chevron-right"></i> Highlights (${high.length})
        </button>
        <div class="collapse-body" id="high-body">
          <div class="list-editor" id="high-editor">
            <div class="list-editor-items" id="high-items">
              ${high.map((item, i) => listItemHtml('high', i, item)).join('')}
            </div>
            <button type="button" class="list-editor-add" onclick="addListItem('high')"><i class="fa-solid fa-plus"></i> Add highlight</button>
          </div>
        </div>
      </div>

      <div class="form-section">
        <button type="button" class="collapse-toggle" onclick="toggleCollapse('route-body', this)">
          <i class="fa-solid fa-chevron-right"></i> Route Map Stops (${stops.length})
        </button>
        <div class="collapse-body" id="route-body">
          <p style="font-size:.8rem;color:var(--slate-500);margin:-.2rem 0 .7rem">Pins shown on the interactive map, in order. Get lat/lng by right-clicking a spot on Google Maps and copying the coordinates.</p>
          <div class="itinerary-editor" id="route-editor">
            ${stops.map((s, i) => routeStopHtml(i, s.day, s.name, s.lat, s.lng, s.note)).join('')}
          </div>
          <button type="button" class="list-editor-add" onclick="addRouteStop()"><i class="fa-solid fa-plus"></i> Add stop</button>
        </div>
      </div>

      <div style="display:flex;gap:.75rem;margin-top:1rem">
        <button type="submit" class="btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${pkg ? 'Save Changes' : 'Add Package'}</button>
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;

  openModal(title, html);

  // Slug auto-fill
  document.querySelector('#pkg-form [name="name"]').addEventListener('input', (e) => {
    if (!editingPackageId) {
      document.querySelector('#pkg-form [name="slug"]').value =
        e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
  });

  // Image preview
  document.getElementById('pkg-img-input').addEventListener('change', function() {
    const preview = document.getElementById('pkg-img-preview');
    preview.innerHTML = '';
    Array.from(this.files).forEach(f => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      preview.appendChild(img);
    });
  });

  // Form submit
  document.getElementById('pkg-form').addEventListener('submit', savePackage);
}

function itinDayHtml(i, title = '', content = '') {
  return `
    <div class="itin-day" id="itin-day-${i}">
      <div class="itin-day-head">
        <span>${i + 1}</span>
        <input type="text" placeholder="Day title, e.g. Arrive Shillong" class="itin-title" value="${esc(title)}">
        <button type="button" onclick="removeItinDay(this)"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <textarea class="itin-content" rows="2" placeholder="What happens on this day...">${esc(content)}</textarea>
    </div>
  `;
}

function routeStopHtml(i, day, name = '', lat = '', lng = '', note = '') {
  const dayVal = day != null ? day : i + 1;
  return `
    <div class="itin-day" id="route-stop-${i}">
      <div class="itin-day-head">
        <span>${dayVal}</span>
        <input type="text" placeholder="Stop name, e.g. Cherrapunji" class="route-name" value="${esc(name)}">
        <button type="button" onclick="removeRouteStop(this)"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="field-row" style="margin-top:.4rem">
        <div class="field"><label style="font-size:.7rem">Day #</label><input type="number" class="route-day" min="1" value="${esc(dayVal)}" oninput="this.closest('.itin-day').querySelector('.itin-day-head span').textContent = this.value || '?'"></div>
        <div class="field"><label style="font-size:.7rem">Latitude</label><input type="text" class="route-lat" placeholder="25.5788" value="${esc(lat)}"></div>
        <div class="field"><label style="font-size:.7rem">Longitude</label><input type="text" class="route-lng" placeholder="91.8933" value="${esc(lng)}"></div>
      </div>
      <textarea class="route-note" rows="2" placeholder="Short note shown in the map popup...">${esc(note)}</textarea>
    </div>
  `;
}

function listItemHtml(prefix, i, value = '') {
  return `
    <div class="list-editor-item" id="${prefix}-item-${i}">
      <input type="text" class="${prefix}-value" value="${esc(value)}" placeholder="Enter item...">
      <button type="button" onclick="this.closest('.list-editor-item').remove()"><i class="fa-solid fa-times"></i></button>
    </div>
  `;
}

function addItinDay() {
  const editor = document.getElementById('itin-editor');
  const count = editor.querySelectorAll('.itin-day').length;
  const div = document.createElement('div');
  div.innerHTML = itinDayHtml(count);
  editor.appendChild(div.firstElementChild);
  // renumber
  renumberItinDays();
}

function removeItinDay(btn) {
  btn.closest('.itin-day').remove();
  renumberItinDays();
}

function renumberItinDays() {
  document.querySelectorAll('#itin-editor .itin-day').forEach((d, i) => {
    d.querySelector('span').textContent = i + 1;
  });
}

function addRouteStop() {
  const editor = document.getElementById('route-editor');
  const count = editor.querySelectorAll('.itin-day').length;
  const lastDay = count ? (parseInt(editor.querySelectorAll('.route-day')[count - 1]?.value) || count) : 1;
  const div = document.createElement('div');
  div.innerHTML = routeStopHtml(count, lastDay);
  editor.appendChild(div.firstElementChild);
}

function removeRouteStop(btn) {
  btn.closest('.itin-day').remove();
}

function addListItem(prefix) {
  const container = document.getElementById(prefix + '-items');
  const count = container.querySelectorAll('.list-editor-item').length;
  const div = document.createElement('div');
  div.innerHTML = listItemHtml(prefix, count);
  container.appendChild(div.firstElementChild);
}

function toggleCollapse(bodyId, btn) {
  const body = document.getElementById(bodyId);
  body.classList.toggle('open');
  btn.classList.toggle('open');
}

async function savePackage(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData();

  // Basic fields
  ['name', 'slug', 'route', 'duration', 'group_size', 'vehicle', 'price', 'description', 'display_order', 'existing_image'].forEach(f => {
    fd.append(f, form.querySelector(`[name="${f}"]`)?.value || '');
  });
  fd.append('featured', form.querySelector('[name="featured"]')?.checked ? 'true' : 'false');

  // Itinerary
  const days = [];
  document.querySelectorAll('#itin-editor .itin-day').forEach((d, i) => {
    days.push({ day: i + 1, title: d.querySelector('.itin-title').value, content: d.querySelector('.itin-content').value });
  });
  fd.append('itinerary', JSON.stringify(days));

  // Lists
  ['incl', 'excl', 'high'].forEach(prefix => {
    const items = Array.from(document.querySelectorAll(`.${prefix}-value`)).map(el => el.value).filter(Boolean);
    const field = { incl: 'inclusions', excl: 'exclusions', high: 'highlights' }[prefix];
    fd.append(field, JSON.stringify(items));
  });

  // Route map stops
  const stops = [];
  document.querySelectorAll('#route-editor .itin-day').forEach((row) => {
    const name = row.querySelector('.route-name').value.trim();
    const lat = parseFloat(row.querySelector('.route-lat').value);
    const lng = parseFloat(row.querySelector('.route-lng').value);
    if (!name || isNaN(lat) || isNaN(lng)) return; // skip incomplete rows
    stops.push({
      day: parseInt(row.querySelector('.route-day').value) || 1,
      name,
      lat,
      lng,
      note: row.querySelector('.route-note').value.trim()
    });
  });
  fd.append('route_stops', JSON.stringify(stops));

  // Image
  const imgFile = document.getElementById('pkg-img-input')?.files[0];
  if (imgFile) fd.append('image', imgFile);

  const btn = form.querySelector('[type="submit"]');
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled = true;

  try {
    if (editingPackageId) {
      await api('PUT', `/api/packages/${editingPackageId}`, fd, true);
      toast('Package updated!');
    } else {
      await api('POST', '/api/packages', fd, true);
      toast('Package added!');
    }
    closeModal();
    loadPackages();
  } catch (ex) {
    toast('Error: ' + ex.message, true);
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${editingPackageId ? 'Save Changes' : 'Add Package'}`;
    btn.disabled = false;
  }
}

async function editPackage(id) {
  const pkg = allPackages.find(p => p.id === id);
  if (pkg) openPackageForm(pkg);
}

async function deletePackage(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/packages/${id}`);
    toast('Package deleted');
    loadPackages();
  } catch (ex) {
    toast('Error: ' + ex.message, true);
  }
}

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
async function loadBookings() {
  try {
    allBookings = await api('GET', '/api/bookings');
    renderBookingsTable();
  } catch (ex) { toast('Failed to load bookings', true); }
}

function renderBookingsTable() {
  const tbody = document.getElementById('bookings-tbody');
  if (!allBookings.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--slate-300)">No booking requests yet. They\'ll show up here as visitors submit the booking form on package pages.</td></tr>';
    return;
  }
  tbody.innerHTML = allBookings.map(b => `
    <tr>
      <td><span class="status-pill ${esc(b.status || 'pending')}">${esc(b.status || 'pending')}</span></td>
      <td><strong>${esc(b.name)}</strong></td>
      <td>
        <div style="font-size:.82rem">${esc(b.phone || '–')}</div>
        ${b.email ? `<div style="font-size:.75rem;color:var(--slate-300)">${esc(b.email)}</div>` : ''}
      </td>
      <td>${esc(b.package_name || '–')}</td>
      <td style="white-space:nowrap">${esc(b.travel_date || '–')}</td>
      <td>${esc(b.group_size || '–')}</td>
      <td style="white-space:nowrap;font-size:.8rem;color:var(--slate-300)">${fmtDate(b.created_at)}</td>
      <td>
        <div class="row-actions">
          ${b.status !== 'confirmed' ? `<button class="btn-edit" onclick="setBookingStatus(${b.id}, 'confirmed')" title="Confirm this booking"><i class="fa-solid fa-check"></i> Confirm</button>` : ''}
          ${b.status !== 'completed' ? `<button class="btn-secondary" onclick="setBookingStatus(${b.id}, 'completed')" title="Trip completed">Complete</button>` : ''}
          ${b.status !== 'cancelled' ? `<button class="btn-secondary" onclick="setBookingStatus(${b.id}, 'cancelled')" title="Cancel this booking">Cancel</button>` : ''}
          <button class="btn-danger" onclick="deleteBooking(${b.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function setBookingStatus(id, status) {
  try {
    await api('PATCH', `/api/bookings/${id}/status`, { status });
    toast('Booking updated');
    loadBookings();
  } catch (ex) { toast('Error: ' + ex.message, true); }
}

async function deleteBooking(id) {
  if (!confirm('Delete this booking request?')) return;
  try {
    await api('DELETE', `/api/bookings/${id}`);
    toast('Booking deleted');
    loadBookings();
  } catch (ex) { toast('Error: ' + ex.message, true); }
}

// ─── ENQUIRIES ────────────────────────────────────────────────────────────────
async function loadEnquiries() {
  try {
    allEnquiries = await api('GET', '/api/enquiries');
    renderEnquiriesTable();
  } catch (ex) { toast('Failed to load enquiries', true); }
}

function renderEnquiriesTable() {
  const tbody = document.getElementById('enquiries-tbody');
  if (!allEnquiries.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--slate-300)">No enquiries yet. Contact-form submissions will show up here.</td></tr>';
    return;
  }
  tbody.innerHTML = allEnquiries.map(en => `
    <tr>
      <td><span class="status-pill ${esc(en.status || 'new')}">${esc(en.status || 'new')}</span></td>
      <td><strong>${esc(en.name)}</strong></td>
      <td>
        <div style="font-size:.82rem">${esc(en.phone || '–')}</div>
        ${en.email ? `<div style="font-size:.75rem;color:var(--slate-300)">${esc(en.email)}</div>` : ''}
      </td>
      <td style="max-width:320px"><span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(en.message)}</span></td>
      <td style="white-space:nowrap;font-size:.8rem;color:var(--slate-300)">${fmtDate(en.created_at)}</td>
      <td>
        <div class="row-actions">
          ${en.status !== 'replied' ? `<button class="btn-edit" onclick="setEnquiryStatus(${en.id}, 'replied')" title="Mark as replied"><i class="fa-solid fa-reply"></i> Replied</button>` : ''}
          ${en.status !== 'closed' ? `<button class="btn-secondary" onclick="setEnquiryStatus(${en.id}, 'closed')" title="Close">Close</button>` : ''}
          <button class="btn-danger" onclick="deleteEnquiry(${en.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function setEnquiryStatus(id, status) {
  try {
    await api('PATCH', `/api/enquiries/${id}/status`, { status });
    toast('Enquiry updated');
    loadEnquiries();
  } catch (ex) { toast('Error: ' + ex.message, true); }
}

async function deleteEnquiry(id) {
  if (!confirm('Delete this enquiry?')) return;
  try {
    await api('DELETE', `/api/enquiries/${id}`);
    toast('Enquiry deleted');
    loadEnquiries();
  } catch (ex) { toast('Error: ' + ex.message, true); }
}

// ─── AVAILABILITY ────────────────────────────────────────────────────────────
let allAvailability = [];
let availabilityFormBound = false;

async function loadAvailability() {
  try {
    const [blocks, pkgs] = await Promise.all([
      api('GET', '/api/admin/availability'),
      api('GET', '/api/packages')
    ]);
    allAvailability = blocks;
    populateAvailabilityPackageSelect(pkgs);
    renderAvailabilityTable();
    bindAvailabilityForm();
  } catch (ex) { toast('Failed to load availability', true); }
}

function populateAvailabilityPackageSelect(pkgs) {
  const select = document.getElementById('avail-package');
  const current = select.value;
  select.innerHTML = '<option value="">Select a package&hellip;</option>' +
    pkgs.map(p => `<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join('');
  if (current) select.value = current;
}

function renderAvailabilityTable() {
  const tbody = document.getElementById('availability-tbody');
  if (!allAvailability.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--slate-300)">No dates blocked yet — every package shows as open.</td></tr>';
    return;
  }
  const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  tbody.innerHTML = allAvailability.map(b => `
    <tr>
      <td><strong>${esc(b.package_name || b.package_slug)}</strong></td>
      <td>${fmt(b.start_date)}</td>
      <td>${fmt(b.end_date)}</td>
      <td>${esc(b.reason || '–')}</td>
      <td>
        <div class="row-actions">
          <button class="btn-danger" onclick="deleteAvailabilityBlock(${b.id})"><i class="fa-solid fa-trash"></i> Remove</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function bindAvailabilityForm() {
  if (availabilityFormBound) return;
  availabilityFormBound = true;
  document.getElementById('availability-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('availability-error');
    errEl.textContent = '';
    const fd = new FormData(e.target);
    const payload = {
      package_slug: fd.get('package_slug'),
      start_date: fd.get('start_date'),
      end_date: fd.get('end_date'),
      reason: fd.get('reason')
    };
    if (!payload.package_slug || !payload.start_date || !payload.end_date) {
      errEl.textContent = 'Please select a package and both dates.';
      return;
    }
    if (payload.start_date > payload.end_date) {
      errEl.textContent = 'Start date must be on or before the end date.';
      return;
    }
    try {
      await api('POST', '/api/admin/availability', payload);
      toast('Dates blocked');
      e.target.reset();
      loadAvailability();
    } catch (ex) {
      errEl.textContent = ex.message;
    }
  });
}

async function deleteAvailabilityBlock(id) {
  if (!confirm('Remove this blocked date range? The package will show as available again for those dates.')) return;
  try {
    await api('DELETE', `/api/admin/availability/${id}`);
    toast('Block removed');
    loadAvailability();
  } catch (ex) { toast('Failed to remove block', true); }
}


async function loadRentals() {
  try {
    allRentals = await api('GET', '/api/rentals');
    renderRentalsTable();
  } catch (ex) { toast('Failed to load rentals', true); }
}

function renderRentalsTable() {
  const tbody = document.getElementById('rentals-tbody');
  if (!allRentals.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--slate-300)">No vehicles yet.</td></tr>';
    return;
  }
  tbody.innerHTML = allRentals.map(r => {
    const tags = Array.isArray(r.tags) ? r.tags : [];
    return `
      <tr>
        <td>${r.image_path ? `<img class="table-thumb" src="/${r.image_path}" alt="${r.name}" onerror="this.style.display='none'">` : '<div class="table-thumb-placeholder"><i class="fa-solid fa-car"></i></div>'}</td>
        <td><strong>${esc(r.name)}</strong></td>
        <td>${esc(r.seats || '–')}</td>
        <td>${tags.map(t => `<span style="display:inline-block;background:var(--mist-100);padding:.1rem .4rem;border-radius:4px;font-size:.75rem;margin:.1rem">${esc(t.label || t)}</span>`).join(' ')}</td>
        <td>
          <div class="row-actions">
            <button class="btn-edit" onclick="editRental(${r.id})"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn-danger" onclick="deleteRental(${r.id}, '${esc(r.name)}')"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openRentalForm(rental = null) {
  editingRentalId = rental ? rental.id : null;
  const tags = Array.isArray(rental?.tags) ? rental.tags : [];

  const html = `
    <form id="rental-form">
      <div class="form-section">
        <h4>Vehicle Details</h4>
        <div class="field">
          <label for="fld-name">Vehicle Name *</label>
          <input id="fld-name" type="text" name="name" value="${esc(rental?.name || '')}" required placeholder="e.g. Toyota Innova Crysta">
        </div>
        <div class="field-row">
          <div class="field">
            <label for="fld-seats">Seats</label>
            <input id="fld-seats" type="text" name="seats" value="${esc(rental?.seats || '')}" placeholder="7">
          </div>
          <div class="field">
            <label for="fld-whatsapp">WhatsApp (raw number)</label>
            <input id="fld-whatsapp" type="text" name="whatsapp" value="${esc(rental?.whatsapp || '')}" placeholder="919707386186">
          </div>
          <div class="field">
            <label for="fld-display_order">Display Order</label>
            <input id="fld-display_order" type="number" name="display_order" value="${rental?.display_order || 0}" min="0">
          </div>
        </div>
      </div>

      <div class="form-section">
        <h4>Feature Tags (shown as badges)</h4>
        <div class="list-editor-items" id="rental-tags">
          ${tags.map((t, i) => `
            <div class="list-editor-item">
              <input type="text" class="tag-label-val" value="${esc(t.label || t)}" placeholder="Tag label, e.g. 7 seats">
              <input type="text" class="tag-icon-val" value="${esc(t.icon || '')}" placeholder="FA icon, e.g. fa-users" style="flex:.7">
              <button type="button" onclick="this.closest('.list-editor-item').remove()"><i class="fa-solid fa-times"></i></button>
            </div>
          `).join('')}
        </div>
        <button type="button" class="list-editor-add" onclick="addRentalTag()"><i class="fa-solid fa-plus"></i> Add tag</button>
      </div>

      <div class="form-section">
        <h4>Vehicle Image</h4>
        ${rental?.image_path ? `<div class="current-image-wrap"><img src="/${rental.image_path}" alt="Current"></div>` : ''}
        <div class="upload-zone" onclick="document.getElementById('rental-img-input').click()">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <p>${rental?.image_path ? 'Click to replace image' : 'Click to upload image'}</p>
          <input type="file" id="rental-img-input" accept="image/*">
        </div>
        <div class="image-preview" id="rental-img-preview"></div>
        <input type="hidden" name="existing_image" value="${esc(rental?.image_path || '')}">
      </div>

      <div style="display:flex;gap:.75rem;margin-top:.5rem">
        <button type="submit" class="btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${rental ? 'Save Changes' : 'Add Vehicle'}</button>
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;

  openModal(rental ? 'Edit Vehicle' : 'Add Rental Vehicle', html);

  document.getElementById('rental-img-input').addEventListener('change', function() {
    const preview = document.getElementById('rental-img-preview');
    preview.innerHTML = '';
    if (this.files[0]) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(this.files[0]);
      preview.appendChild(img);
    }
  });

  document.getElementById('rental-form').addEventListener('submit', saveRental);
}

function addRentalTag() {
  const container = document.getElementById('rental-tags');
  const div = document.createElement('div');
  div.className = 'list-editor-item';
  div.innerHTML = `
    <input type="text" class="tag-label-val" placeholder="Tag label, e.g. 7 seats">
    <input type="text" class="tag-icon-val" placeholder="FA icon, e.g. fa-users" style="flex:.7">
    <button type="button" onclick="this.closest('.list-editor-item').remove()"><i class="fa-solid fa-times"></i></button>
  `;
  container.appendChild(div);
}

async function saveRental(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData();

  fd.append('name', form.querySelector('[name="name"]').value);
  fd.append('seats', form.querySelector('[name="seats"]').value);
  fd.append('whatsapp', form.querySelector('[name="whatsapp"]').value);
  fd.append('display_order', form.querySelector('[name="display_order"]').value);
  fd.append('existing_image', form.querySelector('[name="existing_image"]').value);

  const tags = [];
  document.querySelectorAll('#rental-tags .list-editor-item').forEach(item => {
    const label = item.querySelector('.tag-label-val').value;
    const icon = item.querySelector('.tag-icon-val').value;
    if (label) tags.push({ icon: icon || 'fa-check', label });
  });
  fd.append('tags', JSON.stringify(tags));

  const imgFile = document.getElementById('rental-img-input')?.files[0];
  if (imgFile) fd.append('image', imgFile);

  const btn = form.querySelector('[type="submit"]');
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled = true;

  try {
    if (editingRentalId) {
      await api('PUT', `/api/rentals/${editingRentalId}`, fd, true);
      toast('Vehicle updated!');
    } else {
      await api('POST', '/api/rentals', fd, true);
      toast('Vehicle added!');
    }
    closeModal();
    loadRentals();
  } catch (ex) {
    toast('Error: ' + ex.message, true);
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${editingRentalId ? 'Save Changes' : 'Add Vehicle'}`;
    btn.disabled = false;
  }
}

async function editRental(id) {
  const rental = allRentals.find(r => r.id === id);
  if (rental) openRentalForm(rental);
}

async function deleteRental(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await api('DELETE', `/api/rentals/${id}`);
    toast('Vehicle deleted');
    loadRentals();
  } catch (ex) { toast('Error: ' + ex.message, true); }
}

// ─── GALLERY ─────────────────────────────────────────────────────────────────
async function loadGallery() {
  try {
    allGallery = await api('GET', '/api/gallery');
    renderGalleryGrid();
  } catch (ex) { toast('Failed to load gallery', true); }
}

function renderGalleryGrid() {
  const grid = document.getElementById('gallery-grid');
  if (!allGallery.length) {
    grid.innerHTML = '<p style="color:var(--slate-300);padding:2rem">No photos yet. Upload some!</p>';
    return;
  }
  grid.innerHTML = allGallery.map(item => `
    <div class="gallery-admin-item">
      <img src="/${item.image_path}" alt="${esc(item.alt_text)}" loading="lazy">
      ${item.is_tall ? '<span class="tall-badge">TALL</span>' : ''}
      ${item.location ? `<span class="location-badge"><i class="fa-solid fa-location-dot"></i> ${esc(item.location)}</span>` : ''}
      <div class="item-overlay">
        <button class="overlay-btn" onclick="editGalleryItem(${item.id})" title="Edit alt text & location">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="overlay-btn tall-toggle" onclick="toggleTall(${item.id}, ${item.is_tall})" title="${item.is_tall ? 'Remove tall' : 'Mark tall'}">
          <i class="fa-solid fa-up-down"></i>
        </button>
        <button class="overlay-btn delete" onclick="deleteGalleryItem(${item.id})" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function editGalleryItem(id) {
  const item = allGallery.find(g => g.id === id);
  if (!item) return;
  const html = `
    <form id="gallery-edit-form">
      <div class="field">
        <label for="gal-edit-alt">Alt Text</label>
        <input type="text" id="gal-edit-alt" value="${esc(item.alt_text || '')}" placeholder="Description of the photo">
      </div>
      <div class="field">
        <label for="gal-edit-location">Location <span style="opacity:.6;font-weight:400;">(shown on hover on the homepage)</span></label>
        <input type="text" id="gal-edit-location" value="${esc(item.location || '')}" placeholder="e.g. Anini, Arunachal Pradesh">
      </div>
      <div style="display:flex;gap:.75rem;margin-top:.5rem">
        <button type="submit" class="btn-primary">Save</button>
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;
  openModal('Edit Photo', html);
  document.getElementById('gallery-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('PUT', `/api/gallery/${id}`, {
        alt_text: document.getElementById('gal-edit-alt').value,
        location: document.getElementById('gal-edit-location').value,
        is_tall: item.is_tall ? 'true' : 'false',
        display_order: item.display_order || 0
      });
      toast('Photo updated');
      closeModal();
      loadGallery();
    } catch (ex) { toast('Error: ' + ex.message, true); }
  });
}

function openGalleryUpload() {
  const html = `
    <form id="gallery-form">
      <div class="field">
        <p style="color:var(--slate-500);font-size:.88rem;margin-bottom:1rem">Upload one or multiple photos at once. You can mark them as "tall" (double height) after uploading by clicking the arrows icon on the photo.</p>
      </div>
      <div class="form-section">
        <div class="upload-zone" id="gal-zone" onclick="document.getElementById('gal-input').click()">
          <i class="fa-solid fa-images"></i>
          <p>Click to select photos<br><small>JPG, PNG, WebP — multiple files supported</small></p>
          <input type="file" id="gal-input" accept="image/*" multiple>
        </div>
        <div class="image-preview" id="gal-preview"></div>
      </div>
      <div class="field">
        <label for="gal-alt">Alt Text (for accessibility & SEO)</label>
        <input type="text" id="gal-alt" value="Travel photo from Northeast India" placeholder="Description of the photo">
      </div>
      <div class="field">
        <label for="gal-location">Location <span style="opacity:.6;font-weight:400;">(optional — shown on hover on the homepage; applies to every photo in this batch)</span></label>
        <input type="text" id="gal-location" placeholder="e.g. Anini, Arunachal Pradesh">
      </div>
      <div style="display:flex;gap:.75rem;margin-top:.5rem">
        <button type="submit" class="btn-primary" id="gal-submit"><i class="fa-solid fa-upload"></i> Upload Photos</button>
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;

  openModal('Upload Gallery Photos', html);

  document.getElementById('gal-input').addEventListener('change', function() {
    const preview = document.getElementById('gal-preview');
    preview.innerHTML = '';
    Array.from(this.files).forEach(f => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      preview.appendChild(img);
    });
  });

  document.getElementById('gallery-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = document.getElementById('gal-input').files;
    if (!files.length) { toast('Please select at least one photo', true); return; }

    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('images', f));
    fd.append('alt_text', document.getElementById('gal-alt').value);
    fd.append('location', document.getElementById('gal-location').value);

    const btn = document.getElementById('gal-submit');
    btn.innerHTML = '<span class="spinner"></span> Uploading...';
    btn.disabled = true;

    try {
      const res = await api('POST', '/api/gallery', fd, true);
      toast(`${res.count} photo(s) uploaded!`);
      closeModal();
      loadGallery();
    } catch (ex) {
      toast('Error: ' + ex.message, true);
      btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload Photos';
      btn.disabled = false;
    }
  });
}

async function toggleTall(id, currentIsTall) {
  try {
    const item = allGallery.find(g => g.id === id);
    await api('PUT', `/api/gallery/${id}`, { alt_text: item?.alt_text || '', location: item?.location || '', is_tall: currentIsTall ? 'false' : 'true', display_order: item?.display_order || 0 });
    loadGallery();
  } catch (ex) { toast('Error: ' + ex.message, true); }
}

async function deleteGalleryItem(id) {
  if (!confirm('Delete this photo? This cannot be undone.')) return;
  try {
    await api('DELETE', `/api/gallery/${id}`);
    toast('Photo deleted');
    loadGallery();
  } catch (ex) { toast('Error: ' + ex.message, true); }
}

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────
// These are real visitor-submitted reviews (POST /api/testimonials/submit on
// the public site). They land here as "pending" and only appear on the
// homepage once approved — nothing here is placeholder data.
async function loadTestimonials() {
  try {
    allTestimonials = await api('GET', '/api/testimonials/all');
    renderTestimonialsTable();
    updateTestimonialBadge(allTestimonials);
  } catch (ex) { toast('Failed to load testimonials', true); }
}

function fmtDate(d) {
  if (!d) return '–';
  try { return new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function renderTestimonialsTable() {
  const tbody = document.getElementById('testimonials-tbody');
  if (!allTestimonials.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--slate-300)">No reviews submitted yet. Real reviews will show up here as travelers submit them on the site.</td></tr>';
    return;
  }
  tbody.innerHTML = allTestimonials.map(t => `
    <tr>
      <td><span class="status-pill ${esc(t.status || 'pending')}">${esc(t.status || 'pending')}</span></td>
      <td><strong>${esc(t.name)}</strong>${t.email ? `<div style="font-size:.75rem;color:var(--slate-300)">${esc(t.email)}</div>` : ''}</td>
      <td>${esc(t.package_name || '–')}</td>
      <td>${'★'.repeat(t.rating || 5)}</td>
      <td style="max-width:280px"><span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">"${esc(t.quote)}"</span></td>
      <td style="white-space:nowrap;font-size:.8rem;color:var(--slate-300)">${fmtDate(t.created_at)}</td>
      <td>
        <div class="row-actions">
          ${t.status !== 'approved' ? `<button class="btn-edit" onclick="setTestimonialStatus(${t.id}, 'approved')" title="Approve — shows on the site"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
          ${t.status !== 'rejected' ? `<button class="btn-secondary" onclick="setTestimonialStatus(${t.id}, 'rejected')" title="Reject — keep hidden"><i class="fa-solid fa-xmark"></i> Reject</button>` : ''}
          <button class="btn-edit" onclick="editTestimonial(${t.id})"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn-danger" onclick="deleteTestimonial(${t.id})"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function setTestimonialStatus(id, status) {
  try {
    await api('PATCH', `/api/testimonials/${id}/status`, { status });
    toast(status === 'approved' ? 'Review approved — now live on the site' : 'Review rejected');
    loadTestimonials();
  } catch (ex) { toast('Error: ' + ex.message, true); }
}

function openTestimonialForm(t = null) {
  editingTestimonialId = t ? t.id : null;
  const html = `
    <form id="test-form">
      ${!t ? `<p style="font-size:.82rem;color:var(--slate-300);margin:-.25rem 0 1rem">Use this for a review a traveler gave you over phone, WhatsApp, or in person. It publishes to the site immediately — genuine visitor submissions go through the moderation queue instead.</p>` : ''}
      <div class="field-row">
        <div class="field">
          <label for="fld-name">Reviewer Name *</label>
          <input id="fld-name" type="text" name="name" value="${esc(t?.name || '')}" required placeholder="e.g. Ritika S.">
        </div>
        <div class="field">
          <label for="fld-package_name">Package Name</label>
          <input id="fld-package_name" type="text" name="package_name" value="${esc(t?.package_name || '')}" placeholder="e.g. Meghalaya Explorer">
        </div>
      </div>
      <div class="field">
        <label for="fld-quote">Review *</label>
        <textarea id="fld-quote" name="quote" rows="3" required placeholder="What did they say about their trip?">${esc(t?.quote || '')}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="fld-rating">Rating (1–5 stars)</label>
          <input id="fld-rating" type="number" name="rating" value="${t?.rating || 5}" min="1" max="5">
        </div>
        <div class="field">
          <label for="fld-display_order">Display Order</label>
          <input id="fld-display_order" type="number" name="display_order" value="${t?.display_order || 0}" min="0">
        </div>
      </div>
      <div style="display:flex;gap:.75rem;margin-top:.5rem">
        <button type="submit" class="btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${t ? 'Save Changes' : 'Add Review'}</button>
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;

  openModal(t ? 'Edit Testimonial' : 'Log a Review', html);
  document.getElementById('test-form').addEventListener('submit', saveTestimonial);
}

async function saveTestimonial(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    name: form.querySelector('[name="name"]').value,
    package_name: form.querySelector('[name="package_name"]').value,
    quote: form.querySelector('[name="quote"]').value,
    rating: parseInt(form.querySelector('[name="rating"]').value) || 5,
    display_order: parseInt(form.querySelector('[name="display_order"]').value) || 0
  };

  const btn = form.querySelector('[type="submit"]');
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled = true;

  try {
    if (editingTestimonialId) {
      await api('PUT', `/api/testimonials/${editingTestimonialId}`, data);
      toast('Review updated!');
    } else {
      await api('POST', '/api/testimonials', data);
      toast('Review added!');
    }
    closeModal();
    loadTestimonials();
  } catch (ex) {
    toast('Error: ' + ex.message, true);
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${editingTestimonialId ? 'Save Changes' : 'Add Review'}`;
    btn.disabled = false;
  }
}

function editTestimonial(id) {
  const t = allTestimonials.find(t => t.id === id);
  if (t) openTestimonialForm(t);
}

async function deleteTestimonial(id) {
  if (!confirm('Delete this review?')) return;
  try {
    await api('DELETE', `/api/testimonials/${id}`);
    toast('Review deleted');
    loadTestimonials();
  } catch (ex) { toast('Error: ' + ex.message, true); }
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const settings = await api('GET', '/api/settings');
    const form = document.getElementById('settings-form');
    Object.entries(settings).forEach(([k, v]) => {
      const el = form.querySelector(`[name="${k}"]`);
      if (el) el.value = v;
    });
  } catch (ex) { toast('Failed to load settings', true); }
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
