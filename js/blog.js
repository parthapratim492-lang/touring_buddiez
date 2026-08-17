/* ==================================================
   TOURING BUDDIEZ — BLOG LISTING PAGE
   ================================================== */

(function () {
  "use strict";

  function esc(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return "";
    }
  }

  async function boot() {
    const grid = document.getElementById("blog-listing-grid");
    if (!grid) return;

    let posts;
    try {
      const res = await fetch("/api/blog");
      posts = await res.json();
    } catch {
      grid.innerHTML = '<div class="state-empty"><p>Could not load guides right now — please try again shortly.</p></div>';
      return;
    }

    if (!posts || !posts.length) {
      grid.innerHTML = '<div class="state-empty"><p>New guides are on the way — check back soon.</p></div>';
      return;
    }

    grid.innerHTML = posts.map((p, i) => `
      <a href="blog-post.html?slug=${encodeURIComponent(p.slug)}" class="blog-card tilt" data-reveal data-reveal-delay="${i % 3}">
        <div class="blog-card-media media-zoom">
          <img src="${p.cover_image ? '/' + esc(p.cover_image) : 'assets/hero/poster.jpg'}" alt="${esc(p.title)}" loading="lazy">
        </div>
        <div class="blog-card-body">
          ${p.tags && p.tags.length ? `<div class="blog-card-tags">${p.tags.slice(0, 2).map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.excerpt || '')}</p>
          <div class="blog-card-meta"><span>${fmtDate(p.published_at)}</span><span class="blog-card-read">Read Guide <i class="fa-solid fa-arrow-right"></i></span></div>
        </div>
      </a>
    `).join('');

    if (window.__reinitReveals) window.__reinitReveals();
    if (window.__initTilt) window.__initTilt();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
