/* ==================================================
   TOURING BUDDIEZ — BLOG POST DETAIL PAGE
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

  function setMetaTag(attr, key, content) {
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  function showError(message) {
    document.getElementById("post-hero-title").textContent = "Guide Not Found";
    document.getElementById("post-breadcrumb-title").textContent = "Not Found";
    document.getElementById("blog-post-content").innerHTML = `
      <div class="state-empty">
        <p>${esc(message)}</p>
        <a href="blog.html" class="btn btn-primary" style="margin-top:1rem;">Browse All Guides</a>
      </div>`;
  }

  async function boot() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");
    if (!slug) return showError("No guide was specified.");

    let post;
    try {
      const res = await fetch(`/api/blog/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("not found");
      post = await res.json();
    } catch {
      return showError("This guide doesn't exist or may have been moved.");
    }

    const url = `https://touringbuddieznortheast.in/blog-post.html?slug=${post.slug}`;
    const coverUrl = post.cover_image
      ? `https://touringbuddieznortheast.in/${post.cover_image}`
      : "https://touringbuddieznortheast.in/assets/hero/poster.jpg";

    document.title = `${post.title} | Touring Buddiez`;
    document.getElementById("post-meta-description").setAttribute("content", post.meta_description || post.excerpt || post.title);
    document.getElementById("post-canonical").setAttribute("href", url);
    document.getElementById("post-og-title").setAttribute("content", `${post.title} | Touring Buddiez`);
    document.getElementById("post-og-description").setAttribute("content", post.meta_description || post.excerpt || "");
    document.getElementById("post-og-url").setAttribute("content", url);
    document.getElementById("post-og-image").setAttribute("content", coverUrl);
    document.getElementById("post-twitter-title").setAttribute("content", `${post.title} | Touring Buddiez`);
    document.getElementById("post-twitter-description").setAttribute("content", post.meta_description || post.excerpt || "");
    document.getElementById("post-twitter-image").setAttribute("content", coverUrl);

    const keywords = [post.title, ...(post.tags || []), "Northeast India travel guide", "Touring Buddiez"];
    setMetaTag("name", "keywords", [...new Set(keywords)].join(", "));

    // Article schema — helps this show up as a proper article result in search.
    document.getElementById("post-schema").textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.meta_description || post.excerpt || "",
      image: coverUrl,
      datePublished: post.published_at || post.created_at,
      dateModified: post.updated_at || post.published_at,
      author: { "@type": "Organization", name: "Touring Buddiez" },
      publisher: {
        "@type": "Organization",
        name: "Touring Buddiez",
        logo: { "@type": "ImageObject", url: "https://touringbuddieznortheast.in/assets/logo/logo.png" }
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": url }
    });

    document.getElementById("post-hero-img").src = post.cover_image ? "/" + post.cover_image : "assets/hero/poster.jpg";
    document.getElementById("post-hero-img").alt = post.title;
    document.getElementById("post-hero-title").textContent = post.title;
    document.getElementById("post-breadcrumb-title").textContent = post.title;

    const metaBits = [fmtDate(post.published_at)];
    if (post.tags && post.tags.length) metaBits.push(post.tags.join(" · "));
    document.getElementById("post-hero-meta").textContent = metaBits.filter(Boolean).join("  —  ");

    const bodyHtml = window.parseMarkdownLite ? window.parseMarkdownLite(post.content) : `<p>${esc(post.content)}</p>`;
    document.getElementById("blog-post-content").innerHTML = `
      ${bodyHtml}
      <div class="blog-post-cta">
        <h3>Planning a trip to Northeast India?</h3>
        <p>Tell us your dates and where you're headed — we'll help you build a real itinerary, not just point you at a brochure route.</p>
        <a href="https://wa.me/919707386186" target="_blank" class="btn btn-primary"><i class="fa-brands fa-whatsapp"></i> Chat With Us</a>
        <a href="packages.html" class="btn btn-ghost">Browse Packages</a>
      </div>
    `;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
