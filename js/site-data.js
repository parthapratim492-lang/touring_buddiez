/* ============================================================
   TOURING BUDDIEZ — DYNAMIC CONTENT LOADER
   Fetches content from the API and hydrates the page.
   Falls back gracefully if the API is unavailable.
   ============================================================ */

(function () {
  'use strict';

  async function fetchJSON(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function stars(n) {
    return '★'.repeat(Math.max(1, Math.min(5, n || 5)));
  }

  // ─── Page detection ────────────────────────────────────────────────────────
  const page = document.body.dataset.page || (
    location.pathname.includes('packages.html') ? 'packages' :
    location.pathname.includes('package-detail') ? 'package-detail' :
    'home'
  );

  // ─── HOME PAGE ─────────────────────────────────────────────────────────────
  async function initHomePage() {
    const [settings, packages, rentals, gallery, testimonials] = await Promise.all([
      fetchJSON('/api/settings'),
      fetchJSON('/api/packages?featured=true'),
      fetchJSON('/api/rentals'),
      fetchJSON('/api/gallery'),
      fetchJSON('/api/testimonials')
    ]);

    if (settings) applySettings(settings);
    if (packages && packages.length) renderHomePackages(packages, settings);
    if (rentals && rentals.length) renderRentals(rentals, settings);
    if (gallery && gallery.length) renderGallery(gallery);
    if (window.__initGallerySlideshow) window.__initGallerySlideshow();
    renderTestimonials(testimonials || []);
  }

  function applySettings(s) {
    // Update stat counters
    const statMap = {
      stat_destinations: 'data-count',
      stat_years: 'data-count',
      stat_rating: 'data-count'
    };
    // Update the stats band
    document.querySelectorAll('[data-count]').forEach(el => {
      const val = parseFloat(el.getAttribute('data-count'));
      // Match by parent text
      const parent = el.closest('.stat');
      if (!parent) return;
      const label = parent.querySelector('span')?.textContent?.toLowerCase() || '';
      if (label.includes('destination') && s.stat_destinations) el.setAttribute('data-count', s.stat_destinations);
      else if (label.includes('founded')) {
        if (s.stat_years) el.setAttribute('data-count', s.stat_years);
      }
      else if (label.includes('rating')) {
        if (s.stat_rating) el.setAttribute('data-count', s.stat_rating);
      }
    });

    // Update contact info
    if (s.phone) {
      document.querySelectorAll('a[href^="tel:"]').forEach(el => {
        el.href = 'tel:' + (s.phone_raw || s.phone).replace(/\s/g, '');
        const span = el.querySelector('span') || el;
        if (!el.querySelector('i')) el.textContent = s.phone;
      });
      document.querySelectorAll('.contact-info-item').forEach(item => {
        const icon = item.querySelector('i');
        if (icon && icon.classList.contains('fa-phone')) {
          const a = item.querySelector('a[href^="tel"]');
          if (a) { a.href = 'tel:' + (s.phone_raw || '').replace(/\s/g,''); a.textContent = s.phone; }
        }
        if (icon && icon.classList.contains('fa-whatsapp')) {
          const a = item.querySelector('a[href*="wa.me"]');
          if (a && s.whatsapp) { a.href = `https://wa.me/${s.whatsapp}`; a.textContent = '+' + s.whatsapp; }
        }
        if (icon && icon.classList.contains('fa-instagram')) {
          const a = item.querySelector('a[href*="instagram"]');
          if (a && s.instagram) { a.href = `https://instagram.com/${s.instagram}`; a.textContent = '@' + s.instagram; }
        }
      });
    }

    // Update WhatsApp links
    if (s.whatsapp) {
      document.querySelectorAll('a[href*="wa.me"]').forEach(el => {
        const url = new URL(el.href, location.href);
        el.href = `https://wa.me/${s.whatsapp}`;
      });
    }

    // Update footer description
    if (s.site_description) {
      const fbrand = document.querySelector('.footer-brand p');
      if (fbrand) fbrand.textContent = s.site_description;
    }
  }

  function renderHomePackages(packages, settings) {
    const grid = document.querySelector('.packages-grid');
    if (!grid || !packages || !packages.length) return;

    const whatsapp = settings?.whatsapp || '919707386186';

    const cards = packages.map((p, i) => `
      <article class="pkg-card card tilt" data-reveal${i > 0 ? ` data-reveal-delay="${i % 3}"` : ''}>
        <div class="media-zoom">
          <img src="/${p.image_path}" alt="${esc(p.name)}" onerror="this.src='assets/hero/poster.jpg'">
          <span class="badge">${esc(p.duration || '')}</span>
        </div>
        <div class="pkg-body">
          <div class="pkg-route">${esc(p.route || '')}</div>
          <h3>${esc(p.name)}</h3>
          ${p.price ? `<div class="pkg-price">${esc(p.price)}</div>` : ''}
          <div class="pkg-meta">
            ${p.group_size ? `<span><i class="fa-solid fa-users"></i> ${esc(p.group_size)}</span>` : ''}
            ${p.vehicle ? `<span><i class="fa-solid fa-car"></i> ${esc(p.vehicle)}</span>` : ''}
          </div>
          <div class="pkg-actions">
            <a href="package-detail.html?slug=${esc(p.slug)}" class="btn btn-dark btn-sm">View Details</a>
            ${(p.route_stops && p.route_stops.length) ? `<a href="package-detail.html?slug=${esc(p.slug)}#pkg-route-map" class="btn btn-ghost btn-sm btn-map" aria-label="View route map" title="View route map"><i class="fa-solid fa-map-location-dot"></i></a>` : ''}
          </div>
        </div>
      </article>
    `).join('');

    const cta = `
      <article class="pkg-card card" data-reveal data-reveal-delay="2" style="display:flex;align-items:center;justify-content:center;padding:var(--sp-5);text-align:center;background:var(--forest-800);color:var(--mist-050);">
        <div>
          <i class="fa-solid fa-map-location-dot" style="font-size:2rem;color:var(--brass-400);margin-bottom:1rem;"></i>
          <h3 style="color:var(--mist-050);margin-bottom:.5rem;">Don't see your route?</h3>
          <p style="color:rgba(243,246,241,.7);font-size:var(--fs-sm);margin-bottom:1.2rem;">Tell us where and when — we'll build a custom itinerary.</p>
          <a href="https://wa.me/${whatsapp}" target="_blank" class="btn btn-primary btn-sm">Ask on WhatsApp</a>
        </div>
      </article>
    `;

    grid.innerHTML = cards + cta;
    // Re-trigger reveal animations
    if (window.__reinitReveals) window.__reinitReveals();
  }

  function renderRentals(rentals, settings) {
    const grid = document.querySelector('.rentals-grid');
    if (!grid || !rentals || !rentals.length) return;

    const whatsapp = settings?.whatsapp || '919707386186';

    grid.innerHTML = rentals.map((r, i) => {
      const tags = Array.isArray(r.tags) ? r.tags : [];
      return `
        <article class="veh-card card tilt" data-reveal${i > 0 ? ` data-reveal-delay="${i % 4}"` : ''}>
          <div class="media-zoom">
            <img src="/${r.image_path}" alt="${esc(r.name)}" onerror="this.src='assets/hero/poster.jpg'">
          </div>
          <div class="veh-body">
            <h3>${esc(r.name)}</h3>
            <div class="veh-tags">
              ${tags.map(t => `<span><i class="fa-solid ${esc(t.icon || 'fa-check')}"></i> ${esc(t.label || t)}</span>`).join('')}
            </div>
            <a href="https://wa.me/${r.whatsapp || whatsapp}" target="_blank" class="btn btn-dark btn-sm" style="width:100%;">Book Now</a>
          </div>
        </article>
      `;
    }).join('');

    if (window.__reinitReveals) window.__reinitReveals();
  }

  function renderGallery(gallery) {
    const grid = document.querySelector('.gallery-grid');
    if (!grid || !gallery || !gallery.length) return;

    // Show first 9 items max on homepage
    const items = gallery.slice(0, 9);
    grid.innerHTML = items.map(item => `
      <div class="g-item${item.is_tall ? ' tall' : ''}">
        <img src="/${item.image_path}" alt="${esc(item.alt_text || 'Travel photo')}" loading="lazy">
        ${item.location ? `<span class="g-location"><i class="fa-solid fa-location-dot"></i> ${esc(item.location)}</span>` : ''}
      </div>
    `).join('');
  }

  // Renders only genuine, admin-approved reviews returned by /api/testimonials.
  // There is no fallback set of sample quotes — if nobody has reviewed yet
  // (or nothing's been approved yet), the section says so honestly instead
  // of showing placeholder testimonials.
  function renderTestimonials(testimonials) {
    const track = document.getElementById('t-track') || document.querySelector('.t-track');
    const dotsEl = document.getElementById('t-dots') || document.querySelector('.t-dots');
    const wrap = document.getElementById('t-track-wrap');
    if (!track) return;

    if (!testimonials.length) {
      track.innerHTML = `
        <div class="t-empty">
          <i class="fa-regular fa-comment-dots"></i>
          <p>No reviews yet — be the first traveler to share how your trip went.</p>
        </div>
      `;
      if (dotsEl) dotsEl.innerHTML = '';
      if (wrap) wrap.classList.add('is-empty');
      return;
    }

    if (wrap) wrap.classList.remove('is-empty');

    track.innerHTML = testimonials.map(t => `
      <div class="t-card">
        <div class="t-inner card">
          <div class="t-stars">${'&#9733;'.repeat(Math.max(1, Math.min(5, t.rating || 5)))}</div>
          <p class="t-quote">"${esc(t.quote)}"</p>
          <div class="t-person"><b>${esc(t.name)}</b>${t.package_name ? `<span>&mdash; ${esc(t.package_name)}</span>` : ''}</div>
        </div>
      </div>
    `).join('');

    if (dotsEl) {
      dotsEl.innerHTML = testimonials.length > 1
        ? testimonials.map((_, i) => `<button class="${i === 0 ? 'is-active' : ''}"></button>`).join('')
        : '';
    }

    // The slider only wires itself up once real cards exist in the DOM,
    // so re-init it now that the async fetch has populated the track.
    if (window.__initTestimonialSlider) window.__initTestimonialSlider();
  }

  // ─── PACKAGES PAGE ─────────────────────────────────────────────────────────
  // Renders into the same .packages-grid / .pkg-card markup as the homepage
  // "Featured Packages" section, so admin-managed packages inherit the
  // current design system automatically instead of needing a second theme.
  async function initPackagesPage() {
    const [packages, settings] = await Promise.all([
      fetchJSON('/api/packages'),
      fetchJSON('/api/settings')
    ]);

    const whatsapp = settings?.whatsapp || '919707386186';
    const grid = document.querySelector('.packages-grid');
    if (!grid || !packages || !packages.length) return;

    grid.innerHTML = packages.map((p, i) => `
      <article class="pkg-card card tilt" data-reveal${i > 0 ? ` data-reveal-delay="${i % 4}"` : ''}>
        <div class="media-zoom">
          <img src="/${p.image_path}" alt="${esc(p.name)}" onerror="this.src='assets/hero/poster.jpg'">
          <span class="badge">${esc(p.duration || '')}</span>
        </div>
        <div class="pkg-body">
          <div class="pkg-route">${esc(p.route || '')}</div>
          <h3>${esc(p.name)}</h3>
          ${p.price ? `<div class="pkg-price">${esc(p.price)}</div>` : ''}
          <div class="pkg-meta">
            ${p.group_size ? `<span><i class="fa-solid fa-users"></i> ${esc(p.group_size)}</span>` : ''}
            ${p.vehicle ? `<span><i class="fa-solid fa-car"></i> ${esc(p.vehicle)}</span>` : ''}
          </div>
          <div class="pkg-actions">
            <a href="package-detail.html?slug=${esc(p.slug)}" class="btn btn-dark btn-sm">View Details</a>
            ${(p.route_stops && p.route_stops.length) ? `<a href="package-detail.html?slug=${esc(p.slug)}#pkg-route-map" class="btn btn-ghost btn-sm btn-map" aria-label="View route map" title="View route map"><i class="fa-solid fa-map-location-dot"></i></a>` : ''}
          </div>
        </div>
      </article>
    `).join('');

    if (window.__reinitReveals) window.__reinitReveals();

    // Update WhatsApp links on page
    if (settings?.whatsapp) {
      document.querySelectorAll('a[href*="wa.me"]').forEach(el => {
        el.href = `https://wa.me/${settings.whatsapp}`;
      });
    }
  }

  // ─── PACKAGE DETAIL PAGE ───────────────────────────────────────────────────
  async function initPackageDetailPage() {
    const slug = new URLSearchParams(location.search).get('slug');
    if (!slug) {
      showDetailError('No package specified.');
      return;
    }

    const [pkg, settings] = await Promise.all([
      fetchJSON(`/api/packages/${slug}`),
      fetchJSON('/api/settings')
    ]);

    if (!pkg) {
      showDetailError('Package not found.');
      return;
    }

    const whatsapp = settings?.whatsapp || '919707386186';
    renderPackageDetail(pkg, whatsapp);
  }

  function setMetaTag(attr, key, content) {
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function setCanonical(href) {
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  }

  function setStructuredData(pkg) {
    const id = 'pkg-structured-data';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('script');
      el.id = id;
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    const priceNumber = (pkg.price || '').toString().replace(/[^0-9.]/g, '');
    const data = {
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: pkg.name,
      description: pkg.description || `${pkg.name} — ${pkg.route || ''}`,
      touristType: 'Leisure',
      itinerary: {
        '@type': 'ItemList',
        itemListElement: (Array.isArray(pkg.route_stops) ? pkg.route_stops : []).map((stop, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: typeof stop === 'string' ? stop : (stop.name || `Stop ${i + 1}`)
        }))
      },
      provider: {
        '@type': 'TravelAgency',
        name: 'Touring Buddiez',
        url: 'https://touringbuddieznortheast.in/'
      },
      offers: priceNumber ? {
        '@type': 'Offer',
        price: priceNumber,
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
        url: `https://touringbuddieznortheast.in/package-detail.html?slug=${pkg.slug}`
      } : undefined
    };
    if (pkg.image_path) data.image = `https://touringbuddieznortheast.in/${pkg.image_path}`;
    el.textContent = JSON.stringify(data);
  }

  function showDetailError(msg) {
    const content = document.getElementById('pkg-detail-content');
    if (content) content.innerHTML = `<div class="state-empty"><i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;margin-bottom:1rem;display:block;color:var(--rust-500)"></i><p>${msg}</p><a href="packages.html" class="btn btn-dark btn-sm" style="display:inline-flex;margin-top:1rem">Back to Packages</a></div>`;
  }

  function renderPackageDetail(pkg, whatsapp) {
    // Update page title and meta
    document.title = `${pkg.name} | Touring Buddiez`;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.content = pkg.description || `${pkg.name} — ${pkg.route}`;

    setMetaTag('property', 'og:title', document.title);
    setMetaTag('property', 'og:description', pkg.description || `${pkg.name} — ${pkg.route}`);
    setMetaTag('property', 'og:url', `https://touringbuddieznortheast.in/package-detail.html?slug=${pkg.slug}`);
    if (pkg.image_path) setMetaTag('property', 'og:image', `https://touringbuddieznortheast.in/${pkg.image_path}`);
    setCanonical(`https://touringbuddieznortheast.in/package-detail.html?slug=${pkg.slug}`);

    setMetaTag('name', 'twitter:title', document.title);
    setMetaTag('name', 'twitter:description', pkg.description || `${pkg.name} — ${pkg.route}`);
    if (pkg.image_path) setMetaTag('name', 'twitter:image', `https://touringbuddieznortheast.in/${pkg.image_path}`);

    setStructuredData(pkg);

    // Hero image and title
    const heroImg = document.getElementById('pkg-hero-img');
    if (heroImg) { heroImg.src = '/' + pkg.image_path; heroImg.alt = pkg.name; }

    const heroTitle = document.getElementById('pkg-hero-title');
    if (heroTitle) heroTitle.textContent = pkg.name;

    const heroSub = document.getElementById('pkg-hero-sub');
    if (heroSub) heroSub.textContent = pkg.route || '';

    const breadcrumb = document.getElementById('pkg-breadcrumb-name');
    if (breadcrumb) breadcrumb.textContent = pkg.name;

    // Content
    const content = document.getElementById('pkg-detail-content');
    if (!content) return;

    const itin = Array.isArray(pkg.itinerary) ? pkg.itinerary : [];
    const incl = Array.isArray(pkg.inclusions) ? pkg.inclusions : [];
    const excl = Array.isArray(pkg.exclusions) ? pkg.exclusions : [];
    const high = Array.isArray(pkg.highlights) ? pkg.highlights : [];
    const stops = Array.isArray(pkg.route_stops) ? pkg.route_stops : [];

    content.innerHTML = `
      <div class="pkg-detail-grid">
        <div class="pkg-detail-main">
          <h2>Overview</h2>
          <p>${esc(pkg.description || '')}</p>

          <div class="pkg-detail-tags">
            ${pkg.duration ? `<span><i class="fa-solid fa-clock"></i> ${esc(pkg.duration)}</span>` : ''}
            ${pkg.group_size ? `<span><i class="fa-solid fa-users"></i> ${esc(pkg.group_size)}</span>` : ''}
            ${pkg.vehicle ? `<span><i class="fa-solid fa-car"></i> ${esc(pkg.vehicle)}</span>` : ''}
          </div>

          ${high.length ? `
            <h2>Highlights</h2>
            <div class="pkg-inclusions-grid">
              ${high.map(h => `<div><i class="fa-solid fa-star" style="color:var(--brass-500)"></i> ${esc(h)}</div>`).join('')}
            </div>
          ` : ''}

          ${itin.length ? `
            <h2>Suggested Itinerary</h2>
            <div class="pkg-itinerary">
              ${itin.map(d => `
                <div class="pkg-itin-day">
                  <div class="pkg-day-num">${d.day}</div>
                  <div class="pkg-day-content">
                    <h3>Day ${d.day}: ${esc(d.title)}</h3>
                    <p>${esc(d.content)}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${stops.length ? `
            <div class="pkg-route-map-section">
              <div class="pkg-route-map-head">
                <div>
                  <h2 style="margin-bottom:6px;">Route Map</h2>
                  <p>${esc(pkg.route || '')}. Tap a pin for details, or get live turn-by-turn directions.</p>
                </div>
                <a href="#" id="pkg-directions" target="_blank" rel="noopener" class="pkg-route-directions-btn">
                  <i class="fa-solid fa-diamond-turn-right"></i> Get Directions
                </a>
              </div>
              <div id="pkg-route-map" class="pkg-route-map-container">
                <div class="pkg-route-map-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading map&hellip;</div>
              </div>
              <div id="pkg-route-stops" class="pkg-route-map-stops"></div>
            </div>
          ` : ''}

          <div class="pkg-availability-section">
            <h2>Availability</h2>
            <p class="pkg-availability-intro">Dates shown in red are already blocked — everything else is open. Get in touch to lock in your preferred dates.</p>
            <div id="pkg-availability-calendar" class="pkg-availability-calendar">
              <div class="pkg-route-map-loading"><i class="fa-solid fa-spinner fa-spin"></i> Checking availability&hellip;</div>
            </div>
          </div>

          ${incl.length ? `
            <h2>What's Usually Included</h2>
            <div class="pkg-inclusions-grid">
              ${incl.map(i => `<div><i class="fa-solid fa-circle-check"></i> ${esc(i)}</div>`).join('')}
            </div>
          ` : ''}

          ${excl.length ? `
            <h2>Not Included</h2>
            <div class="pkg-inclusions-grid" style="margin-top:.5rem">
              ${excl.map(e => `<div><i class="fa-solid fa-circle-xmark is-excluded"></i> ${esc(e)}</div>`).join('')}
            </div>
          ` : ''}

          <p class="pkg-detail-footnote">
            Hotels, permits, and meals can be added or arranged separately — ask us for a full quote.
          </p>
        </div>

        <div class="pkg-detail-sidebar">
          <h3>Interested in this trip?</h3>
          ${pkg.price ? `<div class="pkg-price pkg-price-lg">${esc(pkg.price)}</div>` : ''}
          <p>${pkg.price
            ? "Seats are limited and fill up fast — reach out on WhatsApp or send a booking request to lock in your spot."
            : "Send us your dates and group size on WhatsApp and we'll put together a proper quote — no fixed package price, no guesswork."}</p>
          <button type="button" class="btn btn-primary" onclick="TBBooking.open({packageSlug:'${esc(pkg.slug)}', packageName:'${esc(pkg.name).replace(/'/g, "\\'")}'})">
            <i class="fa-solid fa-calendar-check"></i> Book This Trip
          </button>
          <a href="https://wa.me/${whatsapp}?text=Hi%2C%20I'm%20interested%20in%20the%20${encodeURIComponent(pkg.name)}%20package" target="_blank" class="btn btn-dark">
            <i class="fa-brands fa-whatsapp"></i> Enquire on WhatsApp
          </a>
          <a href="index.html#contact" class="btn btn-ghost">Send An Enquiry</a>
          <p class="pkg-sidebar-note">Response usually within a few hours</p>
        </div>
      </div>
    `;

    if (stops.length && window.TBRouteMap) {
      window.TBRouteMap.init({
        mapId: 'pkg-route-map',
        stopsListId: 'pkg-route-stops',
        directionsBtnId: 'pkg-directions',
        stops: stops
      });
    }

    renderAvailabilityCalendar(pkg.slug);
  }

  async function renderAvailabilityCalendar(slug) {
    const el = document.getElementById('pkg-availability-calendar');
    if (!el) return;
    const blocks = await fetchJSON(`/api/packages/${encodeURIComponent(slug)}/availability`);

    // Build a fast lookup of blocked YYYY-MM-DD strings from each [start, end] range.
    const blockedDates = new Set();
    const blockedReasons = new Map();
    (blocks || []).forEach((b) => {
      const start = new Date(b.start_date + 'T00:00:00');
      const end = new Date(b.end_date + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        blockedDates.add(key);
        if (b.reason) blockedReasons.set(key, b.reason);
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function buildMonth(monthOffset) {
      const first = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      const monthLabel = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const startWeekday = first.getDay(); // 0 = Sunday
      const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

      let cells = '';
      for (let i = 0; i < startWeekday; i++) cells += '<span class="pkg-avail-cell is-empty"></span>';
      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(first.getFullYear(), first.getMonth(), day);
        const key = dateObj.toISOString().slice(0, 10);
        const isPast = dateObj < today;
        const isBlocked = blockedDates.has(key);
        const reason = blockedReasons.get(key);
        const cls = isPast ? 'is-past' : (isBlocked ? 'is-blocked' : 'is-open');
        const title = isBlocked && reason ? ` title="${esc(reason)}"` : '';
        cells += `<span class="pkg-avail-cell ${cls}"${title}>${day}</span>`;
      }

      return `
        <div class="pkg-avail-month">
          <h4>${monthLabel}</h4>
          <div class="pkg-avail-weekdays">
            <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
          </div>
          <div class="pkg-avail-grid">${cells}</div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="pkg-avail-months">${buildMonth(0)}${buildMonth(1)}</div>
      <div class="pkg-avail-legend">
        <span><i class="pkg-avail-dot is-open"></i> Open</span>
        <span><i class="pkg-avail-dot is-blocked"></i> Blocked</span>
      </div>
    `;
  }

  // ─── Run ───────────────────────────────────────────────────────────────────
  // Order matters: package-detail and packages are checked first because
  // they're identified unambiguously (a unique element / the URL path).
  // Only after ruling those out do we fall back to the homepage handler,
  // which also targets .packages-grid — the same class packages.html now
  // uses too, since both pages share the new pkg-card design system.
  if (page === 'package-detail' || document.getElementById('pkg-detail-content')) {
    initPackageDetailPage();
  } else if (page === 'packages') {
    initPackagesPage();
  } else if (page === 'home' || document.querySelector('.packages-grid')) {
    initHomePage();
  }

})();
