# Touring Buddiez

A travel website for Touring Buddiez — curated tour packages and car rentals across Northeast India, based in Guwahati, Assam.

## Stack
- **Backend**: Node.js + Express
- **Database**: SQLite (via `better-sqlite3`) — stored at `db/touring_buddiez.db`
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Image uploads**: Multer — stored in `uploads/` directory
- **Auth**: express-session + bcryptjs

## Running the project
```
npm install
npm start
```
The server runs on port 5000.

## Admin Panel
Access the admin panel at `/admin` (e.g. `http://localhost:5000/admin`)

**Default credentials:**
- Username: `admin`
- Password: `admin123`

Change the password after first login via the "Change Password" section.

## Project structure
```
server.js          Express backend + API routes
db/
  database.js      SQLite schema, seed data, query helpers
  touring_buddiez.db  SQLite database (auto-created)
admin/
  index.html       Admin panel SPA
  admin.css        Admin panel styles
  admin.js         Admin panel JavaScript
js/
  main.js          Main site JavaScript (v2 design)
  legacy-app.js    Legacy pages JavaScript
  site-data.js     Dynamic content loader (fetches from API)
css/               Stylesheets
assets/            Static images (logo, destinations, rentals, gallery, hero)
uploads/           User-uploaded images (auto-created)
package-detail.html  Dynamic package detail page (uses ?slug=)
```

## API Endpoints
- `GET /api/packages` — all packages (add `?featured=true` for homepage)
- `GET /api/packages/:slug` — single package
- `GET /api/rentals` — all rentals
- `GET /api/gallery` — all gallery items
- `GET /api/testimonials` — all testimonials
- `GET /api/settings` — site settings

All write endpoints (`POST`, `PUT`, `DELETE`) require admin session auth.

## User preferences
- Keep the existing HTML/CSS structure and design language
- Do not restructure or migrate the frontend framework
- Admin panel should use the site's forest green / brass color palette
