/* ==================================================
   TOURING BUDDIEZ — PAYMENT PAGE
   Reads which payment methods are enabled from the public
   /api/settings endpoint (configured in the admin Payments
   section) and renders only what's actually turned on.
   ================================================== */

(function () {
  "use strict";

  function getFormValues() {
    return {
      name: document.getElementById("pay-name").value.trim(),
      phone: document.getElementById("pay-phone").value.trim(),
      amount: document.getElementById("pay-amount").value.trim(),
      note: document.getElementById("pay-note").value.trim()
    };
  }

  function validate(v) {
    if (!v.name) return "Please enter your name.";
    if (!v.phone) return "Please enter your phone number.";
    const amt = Number(v.amount);
    if (!amt || amt <= 0) return "Please enter a valid amount.";
    if (amt > 1000000) return "That amount looks too large — please contact us directly for payments over ₹10,00,000.";
    return null;
  }

  function showStatus(message, isError) {
    const el = document.getElementById("pay-status");
    el.textContent = message;
    el.className = "pay-status-msg " + (isError ? "err" : "ok");
  }

  function buildUpiLink(upiId, payeeName, amount, note) {
    const params = new URLSearchParams({
      pa: upiId,
      pn: payeeName || "Touring Buddiez",
      am: amount || "",
      cu: "INR"
    });
    if (note) params.set("tn", note);
    return "upi://pay?" + params.toString();
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function renderUpiCard(settings) {
    const card = document.createElement("div");
    card.className = "pay-method-card";
    card.innerHTML = `
      <h3><i class="fa-solid fa-qrcode"></i> Pay by UPI</h3>
      <p>Scan with any UPI app, or tap below on mobile.</p>
      <canvas id="upi-qr-canvas" width="200" height="200"></canvas>
      <div class="pay-app-buttons">
        <a href="#" id="upi-pay-link" class="btn btn-primary btn-sm"><i class="fa-solid fa-mobile-screen"></i> Open UPI App</a>
      </div>
      <div class="pay-upi-id">${settings.upi_id}</div>
      <button type="button" id="upi-paid-btn" class="btn btn-ghost btn-sm">I've completed this payment</button>
    `;
    document.getElementById("pay-methods").appendChild(card);

    function refreshQr() {
      const v = getFormValues();
      const link = buildUpiLink(settings.upi_id, settings.upi_payee_name, v.amount, v.note);
      document.getElementById("upi-pay-link").href = link;
      if (window.QRCode) {
        QRCode.toCanvas(document.getElementById("upi-qr-canvas"), link, { width: 200, margin: 1 }, () => {});
      }
    }
    refreshQr();
    ["pay-amount", "pay-note"].forEach((id) => document.getElementById(id).addEventListener("input", refreshQr));

    document.getElementById("upi-pay-link").addEventListener("click", (e) => {
      const v = getFormValues();
      const err = validate(v);
      if (err) { e.preventDefault(); showStatus(err, true); }
    });

    document.getElementById("upi-paid-btn").addEventListener("click", async () => {
      const v = getFormValues();
      const err = validate(v);
      if (err) return showStatus(err, true);
      try {
        await postJSON("/api/payments/log-upi", v);
        showStatus("Thanks! We've logged your payment and will confirm it shortly.", false);
      } catch (ex) {
        showStatus(ex.message, true);
      }
    });
  }

  function renderCardCard(settings) {
    const card = document.createElement("div");
    card.className = "pay-method-card";
    card.innerHTML = `
      <h3><i class="fa-solid fa-credit-card"></i> Pay by Card / Netbanking</h3>
      <p>Secure checkout via Razorpay — cards, netbanking, and wallets accepted.</p>
      <button type="button" id="card-pay-btn" class="btn btn-primary"><i class="fa-solid fa-lock"></i> Pay Now</button>
    `;
    document.getElementById("pay-methods").appendChild(card);

    document.getElementById("card-pay-btn").addEventListener("click", async () => {
      const v = getFormValues();
      const err = validate(v);
      if (err) return showStatus(err, true);

      const btn = document.getElementById("card-pay-btn");
      btn.disabled = true;
      btn.innerHTML = "Starting payment…";

      try {
        const order = await postJSON("/api/payments/create-order", v);
        if (typeof Razorpay === "undefined") throw new Error("Payment window failed to load. Please refresh and try again.");

        const rzp = new Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          order_id: order.order_id,
          name: "Touring Buddiez",
          description: v.note || "Payment to Touring Buddiez",
          prefill: { name: v.name, contact: v.phone },
          theme: { color: "#173A31" },
          handler: async (response) => {
            try {
              await postJSON("/api/payments/verify", response);
              showStatus("Payment successful — thank you! We'll be in touch shortly.", false);
            } catch (ex) {
              showStatus("Payment received but verification failed. Please contact us with your payment ID: " + response.razorpay_payment_id, true);
            }
          },
          modal: {
            ondismiss: () => {
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-solid fa-lock"></i> Pay Now';
            }
          }
        });
        rzp.on("payment.failed", () => {
          showStatus("Payment failed. Please try again or use UPI instead.", true);
        });
        rzp.open();
      } catch (ex) {
        showStatus(ex.message, true);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> Pay Now';
      }
    });
  }

  async function boot() {
    const container = document.getElementById("pay-methods");
    if (!container) return;

    let settings;
    try {
      const res = await fetch("/api/settings");
      settings = await res.json();
    } catch {
      container.innerHTML = '<div class="pay-disabled-note">Could not load payment options right now. Please <a href="https://wa.me/919707386186" target="_blank">contact us on WhatsApp</a> instead.</div>';
      return;
    }

    const upiOn = settings.payments_upi_enabled === "true" && settings.upi_id;
    const cardOn = settings.payments_card_enabled === "true";

    if (!upiOn && !cardOn) {
      container.innerHTML = '<div class="pay-disabled-note">Online payment isn\'t set up yet — please <a href="https://wa.me/919707386186" target="_blank">reach out on WhatsApp</a> and we\'ll help you pay directly.</div>';
      return;
    }

    if (upiOn) renderUpiCard(settings);
    if (cardOn) renderCardCard(settings);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
