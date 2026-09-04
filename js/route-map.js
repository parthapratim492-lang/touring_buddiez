/* ==================================================
   TOURING BUDDIEZ — ROUTE MAP & TRIP PLANNER
   Renders an interactive Leaflet map for a package's
   itinerary stops, draws the route between them, and
   builds a "Get Directions" link (Google Maps, no API
   key required) so clients can plan/navigate the trip
   themselves.
   ================================================== */

(function () {
  "use strict";

  /**
   * Initializes a route map inside the given container.
   * @param {Object} opts
   * @param {string} opts.mapId        - id of the map <div>
   * @param {string} [opts.stopsListId]- id of the element to list stops in order
   * @param {string} [opts.directionsBtnId] - id of the "Get Directions" link/button
   * @param {Array}  opts.stops        - [{ day, name, lat, lng, note }]
   */
  function initRouteMap(opts) {
    var mapEl = document.getElementById(opts.mapId);
    if (!mapEl || !opts.stops || !opts.stops.length) return;

    function boot() {
      if (typeof L === "undefined") {
        // Leaflet failed to load (e.g. offline) — fail gracefully.
        mapEl.innerHTML =
          '<div class="route-map-loading"><i class="fas fa-map-marked-alt"></i> Map unavailable right now — use "Get Directions" below.</div>';
        return;
      }

      var stops = opts.stops;
      var latlngs = stops.map(function (s) {
        return [s.lat, s.lng];
      });

      var map = L.map(opts.mapId, {
        scrollWheelZoom: false,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      // Route line connecting the stops in itinerary order
      L.polyline(latlngs, {
        color: "#0B3D2E",
        weight: 4,
        opacity: 0.85,
        dashArray: "1,8",
        lineCap: "round",
      }).addTo(map);

      // Numbered day markers
      stops.forEach(function (stop) {
        var icon = L.divIcon({
          className: "",
          html:
            '<div class="route-day-pin"><span>' + stop.day + "</span></div>",
          iconSize: [26, 26],
          iconAnchor: [13, 26],
          popupAnchor: [0, -26],
        });

        L.marker([stop.lat, stop.lng], { icon: icon })
          .addTo(map)
          .bindPopup(
            "<b>Day " +
              stop.day +
              " — " +
              stop.name +
              "</b>" +
              (stop.note ? "<br>" + stop.note : "")
          );
      });

      map.fitBounds(latlngs, { padding: [36, 36] });

      // Re-enable scroll zoom only once the visitor deliberately
      // interacts with the map, so page scrolling isn't hijacked.
      map.once("focus", function () {
        map.scrollWheelZoom.enable();
      });
      mapEl.addEventListener("click", function () {
        map.scrollWheelZoom.enable();
      });

      // Fix sizing issues when the map sits inside a layout that
      // reflows after load (fonts, images, AOS animations, etc.)
      setTimeout(function () {
        map.invalidateSize();
      }, 300);
      window.addEventListener("resize", function () {
        map.invalidateSize();
      });
    }

    boot();

    // Build the stop chips list
    if (opts.stopsListId) {
      var listEl = document.getElementById(opts.stopsListId);
      if (listEl) {
        listEl.innerHTML = opts.stops
          .map(function (s) {
            return (
              "<span><b>" + s.day + "</b>" + escapeHtml(s.name) + "</span>"
            );
          })
          .join("");
      }
    }

    // Build a Google Maps multi-stop directions link — this uses
    // Google's public URL scheme, so no API key is needed and it
    // opens turn-by-turn navigation directly on the client's phone.
    if (opts.directionsBtnId) {
      var btn = document.getElementById(opts.directionsBtnId);
      if (btn) {
        var origin = opts.stops[0];
        var destination = opts.stops[opts.stops.length - 1];
        var waypoints = opts.stops
          .slice(1, -1)
          .map(function (s) {
            return s.lat + "," + s.lng;
          })
          .join("|");

        var url =
          "https://www.google.com/maps/dir/?api=1" +
          "&origin=" + origin.lat + "," + origin.lng +
          "&destination=" + destination.lat + "," + destination.lng +
          (waypoints ? "&waypoints=" + encodeURIComponent(waypoints) : "") +
          "&travelmode=driving";

        btn.setAttribute("href", url);
      }
    }
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  window.TBRouteMap = { init: initRouteMap };
})();
