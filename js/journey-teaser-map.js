/* ==================================================
   TOURING BUDDIEZ — HOMEPAGE JOURNEY MAP TEASER
   A scroll-synced Leaflet map for the "Follow the Road"
   section: as the visitor scrolls past each day in the
   step list, the map pans to that stop and the route
   line progressively draws up to the current day.
   Uses the real coordinates from the Anini Expedition
   package (same data that powers its full route map).
   ================================================== */

(function () {
  "use strict";

  // Real stops from the Anini Expedition itinerary — grouped to match the
  // three teaser steps shown on the homepage (the full 6-day, 7-stop route
  // lives on the package page itself, linked via "View Full Route Map").
  var STOPS_BY_DAY = {
    1: [
      { name: "Guwahati (Pickup)", lat: 26.1445, lng: 91.7362 },
      { name: "Roing", lat: 28.1409, lng: 95.8394 }
    ],
    2: [
      { name: "Anini", lat: 28.8167, lng: 95.9333 }
    ],
    3: [
      { name: "Anini & Dibang Valley", lat: 28.8167, lng: 95.9333 },
      { name: "Mehao Wildlife Sanctuary", lat: 28.1897, lng: 95.8536 }
    ]
  };

  function boot() {
    var mapEl = document.getElementById("jm-map");
    var stepsEl = document.getElementById("jm-steps");
    if (!mapEl || !stepsEl) return;
    if (typeof L === "undefined") return; // fallback image underneath handles this case

    var map = L.map("jm-map", {
      scrollWheelZoom: false,
      zoomControl: false,
      dragging: false,
      attributionControl: false
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18
    }).addTo(map);

    var polyline = L.polyline([], {
      color: "#173A31",
      weight: 4,
      opacity: 0.9,
      dashArray: "1,8",
      lineCap: "round"
    }).addTo(map);

    var markers = [];

    function cumulativeStops(uptoDay) {
      var out = [];
      Object.keys(STOPS_BY_DAY)
        .map(Number)
        .sort(function (a, b) { return a - b; })
        .forEach(function (day) {
          if (day <= uptoDay) out = out.concat(STOPS_BY_DAY[day]);
        });
      return out;
    }

    function renderDay(day) {
      var stops = cumulativeStops(day);
      if (!stops.length) return;

      var latlngs = stops.map(function (s) { return [s.lat, s.lng]; });
      polyline.setLatLngs(latlngs);

      markers.forEach(function (m) { map.removeLayer(m); });
      markers = stops.map(function (s, i) {
        var isLatest = i === stops.length - 1;
        var icon = L.divIcon({
          className: "",
          html: '<div class="route-day-pin' + (isLatest ? ' is-current' : '') + '"><span>' + (i + 1) + "</span></div>",
          iconSize: [24, 24],
          iconAnchor: [12, 24]
        });
        return L.marker([s.lat, s.lng], { icon: icon }).addTo(map);
      });

      map.flyToBounds(latlngs.length > 1 ? latlngs : [latlngs[0], latlngs[0]], {
        padding: [40, 40],
        maxZoom: 9,
        duration: 0.9
      });
    }

    // Boot on day 1 immediately.
    setTimeout(function () {
      map.invalidateSize();
      renderDay(1);
    }, 200);
    window.addEventListener("resize", function () { map.invalidateSize(); });

    // Sync to scroll position via the same reveal-style IntersectionObserver
    // pattern used elsewhere on the site.
    var steps = [].slice.call(stepsEl.querySelectorAll("li[data-day]"));
    if (!steps.length || typeof IntersectionObserver === "undefined") return;

    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var day = parseInt(entry.target.getAttribute("data-day"), 10);
            steps.forEach(function (li) { li.classList.remove("is-active"); });
            entry.target.classList.add("is-active");
            renderDay(day);
          }
        });
      },
      { rootMargin: "-40% 0px -40% 0px" }
    );
    steps.forEach(function (li) { obs.observe(li); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
