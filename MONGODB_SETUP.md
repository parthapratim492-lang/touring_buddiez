# Touring Buddiez — MongoDB Setup

This build replaces the SQLite file database with **MongoDB** (via Mongoose), so your
packages, bookings, enquiries, settings, gallery, rentals, and testimonials survive
restarts and redeploys on Render's free tier without needing a persistent disk.

## What changed

- `db/database.js` was fully rewritten. Every function name is the same as before
  (`getAllPackages`, `createBooking`, etc.), but each one is now `async` and talks
  to MongoDB instead of a local `.db` file.
- `server.js` was updated so every route that calls the database now `await`s it.
- `package.json` — `better-sqlite3` removed, `mongoose` and `dotenv` added.
- Numeric `id` fields (1, 2, 3…) are preserved via a small auto-increment counter,
  so nothing in `admin/admin.js` or your public pages needed to change — they still
  get back the same shape of data they did before.
- The old `touring_buddiez.db` file is gone — delete it if you see it locally.

**Not changed:** uploaded images (package/rental/gallery photos) still get written to
local disk via multer. That's a separate problem from the database — see the note
at the bottom.

## 1. Create a free MongoDB Atlas cluster

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. Create a new project, then build a database → choose the **M0 Free** tier.
3. Under **Database Access**, create a database user with a username and password
   (save these — you'll need them in the connection string).
4. Under **Network Access**, add IP address `0.0.0.0/0` (allow from anywhere) —
   Render's outbound IPs aren't fixed on the free plan, so this is the simplest
   option. You can lock this down later if you upgrade.
5. Go to **Database → Connect → Drivers**, copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<username>`/`<password>` with your real values, and add a database name
   before the `?`, e.g. `.../touring_buddiez?retryWrites=true...`.

## 2. Set environment variables on Render

In your Render service → **Environment**, add:

| Key | Value |
|---|---|
| `MONGODB_URI` | the full connection string from step 1 |
| `SESSION_SECRET` | any long random string |
| `ADMIN_USERNAME` | your preferred admin username (optional, defaults to `admin`) |
| `ADMIN_PASSWORD` | your preferred admin password (optional, defaults to `admin123` — please set this) |
| `NODE_ENV` | `production` |

You do **not** need to set `DATA_DIR` anymore for the database — that variable is now
only relevant to uploaded images (see below).

## 3. Local development

```bash
cp .env.example .env
# edit .env and paste your MONGODB_URI
npm install
npm start
```

Then visit `http://localhost:5000` and `http://localhost:5000/admin`.

The first time it connects to an empty database, it seeds the 6 destination
packages, 4 rental vehicles, gallery photos, and default settings automatically —
same as the old SQLite seed did. It also creates the admin account from
`ADMIN_USERNAME`/`ADMIN_PASSWORD` (or `admin` / `admin123` if you didn't set them).

## 4. Deploy

Push this code to your Render service (or redeploy). Once `MONGODB_URI` is set,
the server connects to Atlas, seeds if needed, and starts — your admin panel edits
will now persist permanently, no matter how many times Render restarts or
redeploys the free instance.

## About uploaded images (separate issue)

Render's free tier disk is ephemeral — anything written to it (including images
uploaded through the admin panel) can disappear on restart/redeploy, the same way
your database used to. MongoDB now fixes the *data* half of that problem, but photo
**files** uploaded via the Package/Rental/Gallery managers still go to local disk
through multer in `server.js`.

Two ways to fully fix this too, if you want it:

1. **Cheapest/simplest:** upgrade to a Render paid plan and attach a persistent
   disk, then set `DATA_DIR` to its mount path (this now only affects `/uploads`,
   not the database).
2. **Free, more work:** move image uploads to a free-tier object store like
   Cloudinary or a MongoDB GridFS bucket, so images live off Render entirely too.

Happy to build either of those next if you want — just say the word.
