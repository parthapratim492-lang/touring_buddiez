/* ==================================================
   TOURING BUDDIEZ — BOOKING MODAL
   A single reusable "Book This Trip" modal. Injects
   itself into the page on first use, posts to
   /api/bookings, and shows a confirmation state.
   ================================================== */

(function () {
  "use strict";

  var MODAL_ID = "tb-booking-modal";

  function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;

    var wrap = document.createElement("div");
    wrap.id = MODAL_ID;
    wrap.className = "tb-modal-overlay";
    wrap.innerHTML =
      '<div class="tb-modal" role="dialog" aria-modal="true" aria-labelledby="tb-booking-title">' +
      '  <button type="button" class="tb-modal-close" aria-label="Close">&times;</button>' +
      '  <div class="tb-modal-body">' +
      '    <h3 id="tb-booking-title">Book This Trip</h3>' +
      '    <p class="tb-modal-sub" id="tb-booking-sub">Send us your details and we\'ll get back to you with availability and a quote.</p>' +
      '    <form id="tb-booking-form">' +
      '      <input type="text" name="website" class="tb-hp" tabindex="-1" autocomplete="off">' +
      '      <input type="hidden" name="package_slug" id="tb-booking-slug">' +
      '      <input type="hidden" name="package_name" id="tb-booking-pkgname">' +
      '      <label>Full Name*<input type="text" name="name" required maxlength="100"></label>' +
      '      <label>Phone Number*<input type="tel" name="phone" required maxlength="30"></label>' +
      '      <label>Email<input type="email" name="email" maxlength="200"></label>' +
      '      <div class="tb-modal-row">' +
      '        <label>Preferred Travel Date<input type="date" name="travel_date"></label>' +
      '        <label>Group Size<input type="text" name="group_size" placeholder="e.g. 4 adults" maxlength="50"></label>' +
      '      </div>' +
      '      <label>Anything else we should know?<textarea name="message" rows="3" maxlength="1000"></textarea></label>' +
      '      <button type="submit" class="btn btn-primary" id="tb-booking-submit">Request Booking</button>' +
      '      <p class="tb-modal-error" id="tb-booking-error" role="alert"></p>' +
      '    </form>' +
      '    <div class="tb-modal-success" id="tb-booking-success" hidden tabindex="-1">' +
      '      <i class="fas fa-circle-check"></i>' +
      '      <h4>Request received!</h4>' +
      '      <p>We\'ll reach out shortly to confirm details and share a quote. If it\'s urgent, WhatsApp us directly.</p>' +
      '      <button type="button" class="btn btn-ghost" id="tb-booking-close-success">Close</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) closeModal();
    });
    wrap.querySelector(".tb-modal-close").addEventListener("click", closeModal);
    document.getElementById("tb-booking-close-success").addEventListener("click", closeModal);

    document.getElementById("tb-booking-form").addEventListener("submit", function (e) {
      e.preventDefault();
      submitBooking(this);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
      if (e.key === "Tab" && wrap.classList.contains("is-open")) trapFocus(e);
    });
  }

  function trapFocus(e) {
    var modal = document.getElementById(MODAL_ID);
    var focusable = [].slice.call(
      modal.querySelectorAll('button, input, textarea, select, a[href]')
    ).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function submitBooking(form) {
    var errorEl = document.getElementById("tb-booking-error");
    var submitBtn = document.getElementById("tb-booking-submit");
    errorEl.textContent = "";

    var data = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      package_slug: form.package_slug.value,
      package_name: form.package_name.value,
      travel_date: form.travel_date.value,
      group_size: form.group_size.value.trim(),
      message: form.message.value.trim(),
      website: form.website.value // honeypot
    };

    if (!data.name || !data.phone) {
      errorEl.textContent = "Please add your name and phone number.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || "Something went wrong.");
          return body;
        });
      })
      .then(function () {
        form.hidden = true;
        var success = document.getElementById("tb-booking-success");
        success.hidden = false;
        success.focus();
      })
      .catch(function (err) {
        errorEl.textContent =
          err.message ||
          "Couldn't send your request right now — please try WhatsApp instead.";
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Request Booking";
      });
  }

  function openModal(opts) {
    opts = opts || {};
    ensureModal();

    var modal = document.getElementById(MODAL_ID);
    var form = document.getElementById("tb-booking-form");
    var success = document.getElementById("tb-booking-success");
    var errorEl = document.getElementById("tb-booking-error");

    // Reset state each time it's opened
    form.reset();
    form.hidden = false;
    success.hidden = true;
    errorEl.textContent = "";

    document.getElementById("tb-booking-slug").value = opts.packageSlug || "";
    document.getElementById("tb-booking-pkgname").value = opts.packageName || "";
    document.getElementById("tb-booking-sub").textContent = opts.packageName
      ? "Booking the " + opts.packageName + " package. Share your details and we'll confirm availability."
      : "Send us your details and we'll get back to you with availability and a quote.";

    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    setTimeout(function () {
      form.querySelector('input[name="name"]').focus();
    }, 50);
  }

  function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  window.TBBooking = { open: openModal, close: closeModal };
})();
