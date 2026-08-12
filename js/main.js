/* ==========================================================================
   TOURING BUDDIEZ v2 — MAIN.JS
   Vanilla JS, no dependencies. Organized as small independent modules that
   each init() once DOM is ready. Respects prefers-reduced-motion throughout.
   ========================================================================== */

(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

  /* ---------------------------------------------------------------------
     1. PRELOADER
  --------------------------------------------------------------------- */
  function initLoader() {
    const loader = document.querySelector(".loader");
    if (!loader) return;
    const done = () => {
      loader.classList.add("is-hidden");
      document.body.classList.remove("no-scroll");
    };
    window.addEventListener("load", () => setTimeout(done, reduceMotion ? 0 : 1400));
    // safety net in case load event is delayed by slow assets
    setTimeout(done, 3500);
  }

  /* ---------------------------------------------------------------------
     2. NAVIGATION — scroll state, mobile menu, active link
  --------------------------------------------------------------------- */
  function initNav() {
    const nav = document.querySelector(".nav");
    const burger = document.querySelector(".nav-burger");
    const mobileMenu = document.querySelector(".mobile-menu");
    if (!nav) return;

    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (burger && mobileMenu) {
      burger.addEventListener("click", () => {
        const open = burger.classList.toggle("is-open");
        mobileMenu.classList.toggle("is-open", open);
        document.body.classList.toggle("no-scroll", open);
        burger.setAttribute("aria-expanded", String(open));
      });
      mobileMenu.querySelectorAll("a").forEach((a) =>
        a.addEventListener("click", () => {
          burger.classList.remove("is-open");
          mobileMenu.classList.remove("is-open");
          document.body.classList.remove("no-scroll");
          burger.setAttribute("aria-expanded", "false");
        })
      );
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && mobileMenu.classList.contains("is-open")) {
          burger.classList.remove("is-open");
          mobileMenu.classList.remove("is-open");
          document.body.classList.remove("no-scroll");
          burger.setAttribute("aria-expanded", "false");
          burger.focus();
        }
      });
    }

    // active link highlight on scroll
    const sections = [...document.querySelectorAll("section[id]")];
    const links = [...document.querySelectorAll(".nav-links a")];
    if (sections.length && links.length) {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === `#${entry.target.id}`));
            }
          });
        },
        { rootMargin: "-45% 0px -45% 0px" }
      );
      sections.forEach((s) => obs.observe(s));
    }
  }

  /* ---------------------------------------------------------------------
     3. CUSTOM CURSOR (desktop only) — a small dot everywhere, growing into
     a circle with a "VIEW"/"EXPLORE" label over large images specifically.
  --------------------------------------------------------------------- */
  function initCursor() {
    if (isTouch || reduceMotion) return;
    const dot = document.createElement("div");
    dot.className = "cursor-dot";
    const label = document.createElement("span");
    label.className = "cursor-dot-label";
    dot.appendChild(label);
    document.body.appendChild(dot);

    let x = 0, y = 0, cx = 0, cy = 0;
    window.addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; });
    (function raf() {
      cx += (x - cx) * 0.2;
      cy += (y - cy) * 0.2;
      dot.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
      requestAnimationFrame(raf);
    })();

    const hoverables = "a, button, .tilt, input, textarea, select";
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest(hoverables)) dot.classList.add("is-hover");
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(hoverables)) dot.classList.remove("is-hover");
    });

    // Large-image hover: swap the small dot for a bigger circle with a
    // short label, so a big photo invites a click instead of just sitting
    // there passively.
    const imageTargets = [
      { sel: ".pkg-card .media-zoom, .veh-card .media-zoom", text: "View" },
      { sel: ".g-item", text: "View" },
      { sel: ".exp-card", text: "Explore" },
      { sel: ".offbeat-media, .cinematic-cta-media", text: "Explore" }
    ];
    document.addEventListener("mouseover", (e) => {
      for (const t of imageTargets) {
        if (e.target.closest(t.sel)) {
          label.textContent = t.text;
          dot.classList.add("is-image");
          return;
        }
      }
    });
    document.addEventListener("mouseout", (e) => {
      for (const t of imageTargets) {
        if (e.target.closest(t.sel)) { dot.classList.remove("is-image"); return; }
      }
    });
  }

  /* ---------------------------------------------------------------------
     3b. MAGNETIC BUTTONS (desktop only) — primary CTAs nudge 3-5px toward
     the cursor on hover. Deliberately tiny; the user should barely notice.
  --------------------------------------------------------------------- */
  function initMagneticButtons() {
    if (isTouch || reduceMotion) return;
    const targets = document.querySelectorAll(".btn-primary");
    const MAX = 5;
    targets.forEach((btn) => {
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const relX = (e.clientX - r.left) / r.width - 0.5;
        const relY = (e.clientY - r.top) / r.height - 0.5;
        // -2px keeps the existing CSS hover-lift feel instead of the JS
        // transform silently overriding it (inline styles win over :hover).
        btn.style.transform = `translate(${relX * MAX * 2}px, ${relY * MAX * 2 - 2}px)`;
      });
      btn.addEventListener("mouseleave", () => { btn.style.transform = ""; });
    });
  }

  /* ---------------------------------------------------------------------
     3c. PAGE TRANSITION — opening a destination page feels like the next
     chapter of the journey rather than an instant swap. A dark overlay
     fades in, then the browser navigates. Skipped entirely for
     reduced-motion (instant navigation) and never hijacks new-tab clicks
     (middle-click, ctrl/cmd-click, or target="_blank").
  --------------------------------------------------------------------- */
  function initPageTransition() {
    const overlay = document.querySelector(".page-transition");
    if (!overlay || reduceMotion) return;

    document.addEventListener("click", (e) => {
      const link = e.target.closest('a[href*="package-detail.html"]');
      if (!link) return;
      if (link.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;

      const href = link.href;
      e.preventDefault();
      overlay.classList.add("is-active");
      setTimeout(() => { window.location.href = href; }, 550);
    });
  }

  /* ---------------------------------------------------------------------
     4. SCROLL REVEAL
     initReveal() covers elements present at page load. Content injected
     later (package/rental cards fetched from the API) needs to be handed
     to the SAME observer, or it stays at its pre-reveal opacity:0 forever
     since nothing ever tells it to become visible. window.__reinitReveals
     is the hook site-data.js calls after injecting new [data-reveal]
     elements — re-observing an already-visible element is harmless, so
     this is safe to call as often as needed.
  --------------------------------------------------------------------- */
  let revealObserver = null;

  function observeReveals() {
    const els = document.querySelectorAll("[data-reveal]:not([data-reveal-bound])");
    if (!els.length) return;
    if (reduceMotion) {
      els.forEach((el) => { el.classList.add("is-visible"); el.setAttribute("data-reveal-bound", ""); });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries, o) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              o.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
    }
    els.forEach((el) => { revealObserver.observe(el); el.setAttribute("data-reveal-bound", ""); });
  }

  function initReveal() {
    observeReveals();
  }

  window.__reinitReveals = observeReveals;

  /* ---------------------------------------------------------------------
     5. STAT COUNTERS
  --------------------------------------------------------------------- */
  function initCounters() {
    const counters = document.querySelectorAll("[data-count]");
    if (!counters.length) return;

    const animate = (el) => {
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || "";
      const decimals = el.dataset.count.includes(".") ? el.dataset.count.split(".")[1].length : 0;
      const duration = 1600;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      if (reduceMotion) el.textContent = target.toFixed(decimals) + suffix;
      else requestAnimationFrame(step);
    };

    const obs = new IntersectionObserver(
      (entries, o) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate(entry.target);
            o.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((c) => obs.observe(c));
  }

  /* ---------------------------------------------------------------------
     6. 3D TILT CARDS
  --------------------------------------------------------------------- */
  function initTilt() {
    if (isTouch || reduceMotion) return;
    document.querySelectorAll(".tilt").forEach((card) => {
      const strength = 8;
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--ry", `${px * strength * 2}deg`);
        card.style.setProperty("--rx", `${-py * strength}deg`);
      });
      card.addEventListener("mouseleave", () => {
        card.style.setProperty("--rx", `0deg`);
        card.style.setProperty("--ry", `0deg`);
      });
    });
  }

  /* ---------------------------------------------------------------------
     7. BUTTON RIPPLE
  --------------------------------------------------------------------- */
  function initRipple() {
    document.querySelectorAll(".btn").forEach((btn) => {
      btn.addEventListener("click", function (e) {
        if (reduceMotion) return;
        const r = btn.getBoundingClientRect();
        const ripple = document.createElement("span");
        const size = Math.max(r.width, r.height);
        ripple.className = "ripple";
        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = e.clientX - r.left - size / 2 + "px";
        ripple.style.top = e.clientY - r.top - size / 2 + "px";
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);
      });
    });
  }

  /* ---------------------------------------------------------------------
     8. HERO PARALLAX — nudges whichever video/fallback layer is active
  --------------------------------------------------------------------- */
  function initParallax() {
    const media = document.getElementById("hero-media");
    if (!media || reduceMotion) return;
    window.addEventListener(
      "scroll",
      () => {
        const y = Math.min(window.scrollY, 900) * 0.18;
        media.querySelectorAll(".hero-video.is-active, .hero-fallback").forEach((el) => {
          el.style.transform = `scale(1.12) translateY(${y}px)`;
        });
      },
      { passive: true }
    );
  }

  /* ---------------------------------------------------------------------
     8b. HERO VIDEO SEQUENCE — plays hero1 → hero2 → hero3 → loop,
     crossfading between clips. On very slow connections or data-saver,
     falls back to a lightweight photo slideshow instead (same crossfade
     feel, far less bandwidth than three videos). Reduced-motion users get
     a single still photo with no cycling at all, full stop.
  --------------------------------------------------------------------- */
  function initHeroVideo() {
    const media = document.getElementById("hero-media");
    if (!media) return;
    const videos = [...media.querySelectorAll(".hero-video")];
    if (!videos.length) return;

    const conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
    const dataSaver = conn && (conn.saveData || /2g/.test(conn.effectiveType || ""));

    if (dataSaver || reduceMotion) {
      media.classList.add("no-video");
      if (!reduceMotion) initHeroPhotoSlideshow(media); // data-saver only, not reduced-motion
      return;
    }

    let current = 0;
    const dots = document.querySelectorAll(".hero-clip-dots span");

    const activate = (i) => {
      videos.forEach((v, vi) => v.classList.toggle("is-active", vi === i));
      dots.forEach((d, di) => d.classList.toggle("is-active", di === i));
      const next = videos[(i + 1) % videos.length];
      if (next.preload === "none") next.preload = "auto";
      const active = videos[i];
      active.currentTime = 0; // guarantee a clean restart each time this clip comes back around
      const playPromise = active.play();
      if (playPromise) playPromise.catch(() => {}); // autoplay can be blocked; poster still shows
    };

    videos.forEach((v, i) => {
      v.addEventListener("ended", () => {
        current = (i + 1) % videos.length;
        activate(current);
      });
      // If a clip errors out entirely (unsupported codec, failed fetch,
      // etc.) fall back to the photo slideshow rather than showing nothing.
      v.addEventListener("error", () => {
        media.classList.add("no-video");
        initHeroPhotoSlideshow(media);
      });
    });

    activate(0);
  }

  function initHeroPhotoSlideshow(media) {
    if (media.dataset.slideshowRunning) return;
    media.dataset.slideshowRunning = "true";
    const photos = [...media.querySelectorAll(".hero-fallback")];
    if (photos.length < 2) return;
    let i = photos.findIndex((p) => p.classList.contains("is-active"));
    if (i < 0) i = 0;
    setInterval(() => {
      photos[i].classList.remove("is-active");
      i = (i + 1) % photos.length;
      photos[i].classList.add("is-active");
    }, 6000);
  }

  /* ---------------------------------------------------------------------
     9. GALLERY SLIDESHOW — click any photo to open a full slideshow across
     every photo in the gallery (not just the ones visible on screen).
     Arrow keys / on-screen arrows / swipe to navigate, plus a play/pause
     toggle for a gentle auto-advance. Re-initialized after site-data.js
     injects the gallery photos (see window.__initGallerySlideshow below),
     since that content loads asynchronously after this file first runs —
     slides/index/playing live in this outer scope (not re-created per
     call) so the nav controls, wired only once, always read current data.
  --------------------------------------------------------------------- */
  let slideshowTimer = null;
  let gsSlides = [];
  let gsIndex = 0;
  let gsPlaying = false;

  function initLightbox() {
    const items = [...document.querySelectorAll(".g-item")];
    const lightbox = document.querySelector(".lightbox");
    if (!items.length || !lightbox) return;

    const img = lightbox.querySelector("img");
    const close = lightbox.querySelector(".lightbox-close");
    const prevBtn = lightbox.querySelector(".lightbox-prev");
    const nextBtn = lightbox.querySelector(".lightbox-next");
    const playBtn = lightbox.querySelector(".lightbox-play");
    const counter = lightbox.querySelector(".lightbox-counter");

    // Refresh the shared slide list every time this runs (static fallback
    // markup first, then the real photos once site-data.js loads them).
    gsSlides = items.map((item) => {
      const im = item.querySelector("img");
      return { src: im.src, alt: im.alt };
    });

    const show = (i) => {
      gsIndex = (i + gsSlides.length) % gsSlides.length;
      const s = gsSlides[gsIndex];
      img.src = s.src;
      img.alt = s.alt;
      if (counter) counter.textContent = `${gsIndex + 1} / ${gsSlides.length}`;
    };

    const stopPlaying = () => {
      gsPlaying = false;
      if (slideshowTimer) clearInterval(slideshowTimer);
      if (playBtn) playBtn.classList.remove("is-playing");
    };
    const startPlaying = () => {
      if (reduceMotion) return; // no auto-advance for reduced-motion users
      gsPlaying = true;
      if (playBtn) playBtn.classList.add("is-playing");
      slideshowTimer = setInterval(() => show(gsIndex + 1), 3500);
    };

    items.forEach((item, i) => {
      item.addEventListener("click", () => {
        show(i);
        lightbox.classList.add("is-open");
        document.body.classList.add("no-scroll");
      });
    });

    // The lightbox chrome itself (close/prev/next/play/keyboard/swipe) only
    // needs wiring once — re-attaching on the second call (after dynamic
    // gallery load) would double-fire every action. It's safe to wire once
    // here because show/stopPlaying/startPlaying always read the shared
    // gsSlides/gsIndex/gsPlaying above, which this function keeps current.
    if (lightbox.dataset.wired) return;
    lightbox.dataset.wired = "true";

    const closeFn = () => {
      lightbox.classList.remove("is-open");
      document.body.classList.remove("no-scroll");
      stopPlaying();
    };

    close.addEventListener("click", closeFn);
    lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeFn(); });
    if (prevBtn) prevBtn.addEventListener("click", () => { stopPlaying(); show(gsIndex - 1); });
    if (nextBtn) nextBtn.addEventListener("click", () => { stopPlaying(); show(gsIndex + 1); });
    if (playBtn) playBtn.addEventListener("click", () => (gsPlaying ? stopPlaying() : startPlaying()));

    document.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (e.key === "Escape") closeFn();
      if (e.key === "ArrowRight") { stopPlaying(); show(gsIndex + 1); }
      if (e.key === "ArrowLeft") { stopPlaying(); show(gsIndex - 1); }
    });

    // Basic swipe support for touch devices.
    let touchStartX = null;
    lightbox.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener("touchend", (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) { stopPlaying(); show(gsIndex + (dx < 0 ? 1 : -1)); }
      touchStartX = null;
    }, { passive: true });
  }
  window.__initGallerySlideshow = initLightbox;

  /* ---------------------------------------------------------------------
     10. TESTIMONIAL SLIDER
  --------------------------------------------------------------------- */
  let testimonialCleanup = null;
  function initTestimonials() {
    const track = document.querySelector(".t-track");
    const dotsWrap = document.querySelector(".t-dots");
    if (!track || !dotsWrap) return;

    // Cards are injected asynchronously once real reviews come back from the
    // API (see js/site-data.js), so this can run again after that happens —
    // tear down any previous timer/listeners first.
    if (testimonialCleanup) testimonialCleanup();

    const slides = track.querySelectorAll(".t-card").length;
    if (slides < 1) return; // nothing to animate yet (loading state or empty state)

    let index = 0;
    const dots = [...dotsWrap.children];
    const go = (i) => {
      index = (i + slides) % slides;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((d, di) => d.classList.toggle("is-active", di === index));
    };
    dots.forEach((d, i) => d.addEventListener("click", () => go(i)));

    if (slides <= 1 || reduceMotion) return; // no need to auto-rotate a single review

    let timer = setInterval(() => go(index + 1), 5500);
    const section = track.closest(".testimonials");
    const onEnter = () => clearInterval(timer);
    const onLeave = () => { timer = setInterval(() => go(index + 1), 5500); };
    section.addEventListener("mouseenter", onEnter);
    section.addEventListener("mouseleave", onLeave);

    testimonialCleanup = () => {
      clearInterval(timer);
      section.removeEventListener("mouseenter", onEnter);
      section.removeEventListener("mouseleave", onLeave);
      testimonialCleanup = null;
    };
  }
  window.__initTestimonialSlider = initTestimonials;

  /* ---------------------------------------------------------------------
     10b. REVIEW SUBMISSION — real visitor reviews, sent to the backend
     for moderation. Nothing here is pre-filled or auto-published.
  --------------------------------------------------------------------- */
  function initReviewForm() {
    const modal = document.getElementById("review-modal");
    const openBtn = document.getElementById("open-review-btn");
    const form = document.getElementById("review-form");
    if (!modal || !form) return;

    const starWrap = document.getElementById("star-input");
    const msgEl = document.getElementById("review-form-msg");
    let rating = 5;

    function paintStars() {
      if (!starWrap) return;
      [...starWrap.children].forEach((btn, i) => {
        btn.classList.toggle("is-filled", i < rating);
      });
    }
    if (starWrap) {
      paintStars();
      [...starWrap.children].forEach((btn) => {
        btn.addEventListener("click", () => {
          rating = parseInt(btn.dataset.star, 10) || 5;
          paintStars();
        });
      });
    }

    function openModal() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("no-scroll");
      const first = form.querySelector('input[name="name"]');
      if (first) setTimeout(() => first.focus(), 250);
    }
    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("no-scroll");
    }

    if (openBtn) openBtn.addEventListener("click", openModal);
    modal.querySelectorAll("[data-close-review]").forEach((el) => el.addEventListener("click", closeModal));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const submitBtn = form.querySelector('[type="submit"]');
      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending\u2026";
      msgEl.textContent = "";
      msgEl.className = "review-form-msg";

      try {
        const res = await fetch("/api/testimonials/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.get("name"),
            package_name: data.get("package_name"),
            quote: data.get("quote"),
            rating,
            email: data.get("email"),
            website: data.get("website") // honeypot
          })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");

        msgEl.textContent = "Thank you \u2014 your review is with our team and will appear here once approved.";
        msgEl.className = "review-form-msg is-success";
        form.reset();
        rating = 5;
        paintStars();
        setTimeout(closeModal, 2200);
      } catch (err) {
        msgEl.textContent = err.message || "Couldn't send your review — please try again.";
        msgEl.className = "review-form-msg is-error";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  /* ---------------------------------------------------------------------
     11. CONTACT FORM → SAVE ENQUIRY + WHATSAPP HANDOFF
     Saves the lead to the database first (so it always shows up in the
     admin dashboard, even if the visitor never actually sends the
     WhatsApp message), then opens WhatsApp as before.
  --------------------------------------------------------------------- */
  function initContactForm() {
    const form = document.querySelector("#contact-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = data.get("name") || "";
      const phone = data.get("phone") || "";
      const dest = data.get("destination") || "";
      const dates = data.get("dates") || "";
      const travelers = data.get("travelers") || "";
      const tripType = data.get("trip_type") || "";
      const msg = data.get("message") || "";

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalLabel = submitBtn ? submitBtn.innerHTML : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = "Sending…";
      }

      const enquiryMessage =
        `Destination: ${dest || "—"}. Travel dates: ${dates || "—"}. ` +
        `Travelers: ${travelers || "—"}. Trip type: ${tripType || "—"}. Notes: ${msg || "—"}`;

      fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          message: enquiryMessage,
          source: "contact_form",
        }),
      })
        .catch(() => {
          /* Saving is best-effort — the WhatsApp handoff below is the
             real fallback, so a network hiccup here shouldn't block it. */
        })
        .finally(() => {
          const enc = encodeURIComponent;
          const text =
            `Hi Touring Buddiez! I'd like to plan a trip.%0A` +
            `Name: ${enc(name)}%0APhone: ${enc(phone)}%0ADestination: ${enc(dest)}%0A` +
            `Travel dates: ${enc(dates)}%0ATravelers: ${enc(travelers)}%0ATrip type: ${enc(tripType)}%0ANotes: ${enc(msg)}`;
          window.open(`https://wa.me/919707386186?text=${text}`, "_blank");
          form.reset();
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalLabel;
          }
        });
    });
  }

  /* ---------------------------------------------------------------------
     INIT
  --------------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("no-scroll");
    initLoader();
    initNav();
    initCursor();
    initMagneticButtons();
    initPageTransition();
    initReveal();
    initCounters();
    initTilt();
    initRipple();
    initParallax();
    initHeroVideo();
    initLightbox();
    initTestimonials();
    initReviewForm();
    initContactForm();
  });

  /* ---------------------------------------------------------------------
     PWA — service worker registration
     Registered from every page (not just index.html) so the app is
     installable no matter where a visitor lands first.
  --------------------------------------------------------------------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Silent — a failed SW registration shouldn't break the page.
      });
    });
  }
})();
