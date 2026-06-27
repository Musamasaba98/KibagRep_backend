/**
 * Seed LocationPing data for demo route tracking.
 * Generates realistic Kampala GPS breadcrumb trails for each rep.
 * Pings every ~5 minutes from 08:00–17:30 for each seeded day.
 *
 * Run:
 *   DATABASE_URL="<render-url>?sslmode=require" node seed_gps_pings.js
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING.
 */
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

// ── Kampala anchor points (lat, lng) ──────────────────────────────────────────
// These are real Kampala landmarks reps would pass through
const KAMPALA_ROUTES = {
  sarah: {
    // Sarah: Nakasero / City Centre / Kololo corridor
    waypoints: [
      [0.3163, 32.5882],  // Nakasero Hospital area — start
      [0.3185, 32.5854],  // Towards Nakasero hill
      [0.3210, 32.5822],  // Nakasero Market
      [0.3178, 32.5795],  // Kampala Road
      [0.3153, 32.5930],  // Case Hospital (Muyenga)
      [0.3130, 32.5960],  // Luthuli Ave
      [0.3095, 32.5928],  // Buganda Road
      [0.3063, 32.5892],  // Makerere Hill Rd area
      [0.3078, 32.5847],  // Wandegeya junction
      [0.3217, 32.5794],  // Kampala Hospital (Mulago branch clinic)
      [0.3280, 32.5810],  // Upper Mulago road
      [0.3163, 32.5882],  // back to Nakasero — end of day
    ],
  },
  ronald: {
    // Ronald: Mulago / Old Kampala / Mengo corridor
    waypoints: [
      [0.3476, 32.5764],  // Mulago National Referral Hospital — start
      [0.3420, 32.5742],  // Mulago hill descent
      [0.3360, 32.5718],  // Wandegeya Roundabout area
      [0.3290, 32.5672],  // Old Kampala hill
      [0.3218, 32.5635],  // Old Kampala Police
      [0.3192, 32.5600],  // Old Kampala top
      [0.3140, 32.5590],  // Namirembe Road
      [0.3077, 32.5569],  // Mengo Hospital — key stop
      [0.3020, 32.5601],  // Rubaga Road
      [0.3045, 32.5688],  // Kabalagala junction
      [0.3110, 32.5730],  // Muyenga Road
      [0.3476, 32.5764],  // back to Mulago — end
    ],
  },
  diana: {
    // Diana: Nsambya / Makindye / Ggaba corridor
    waypoints: [
      [0.2888, 32.5788],  // Nsambya Hospital — start
      [0.2920, 32.5820],  // Nsambya road junction
      [0.2960, 32.5860],  // Buziga Hill
      [0.3020, 32.5910],  // Muyenga roundabout
      [0.3055, 32.5944],  // Muyenga Tank Hill
      [0.2990, 32.5975],  // Ggaba Road
      [0.2948, 32.6020],  // Luzira area
      [0.2900, 32.5990],  // Makindye Road
      [0.2862, 32.5924],  // Makindye Barracks junction
      [0.2840, 32.5870],  // Makindye clinic area
      [0.2866, 32.5820],  // back up Nsambya Road
      [0.2888, 32.5788],  // end at Nsambya Hospital
    ],
  },
};

// ── Days to seed ──────────────────────────────────────────────────────────────
// Today + last 4 working days
const SEED_DATES = ["2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27"];

// Ping interval: 5 minutes (real app is 45s, but for demo data 5min is plenty)
const PING_INTERVAL_MIN = 5;
const WORK_START_H = 8;   // 8:00 AM
const WORK_END_H   = 17;  // 5:30 PM (105 pings per day per rep)
const WORK_END_MIN = 30;

// ── Interpolate a smooth path between waypoints ───────────────────────────────
function interpolatePath(waypoints, totalPoints) {
  if (waypoints.length < 2) return Array(totalPoints).fill(waypoints[0]);
  const segments = waypoints.length - 1;
  const pointsPerSegment = Math.max(1, Math.floor(totalPoints / segments));
  const path = [];
  for (let s = 0; s < segments; s++) {
    const [lat1, lng1] = waypoints[s];
    const [lat2, lng2] = waypoints[s + 1];
    const count = (s === segments - 1) ? (totalPoints - path.length) : pointsPerSegment;
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(count - 1, 1);
      // Add small random noise (±0.0003°, ~33m) to simulate real GPS jitter
      const jitterLat = (Math.random() - 0.5) * 0.0006;
      const jitterLng = (Math.random() - 0.5) * 0.0006;
      path.push([lat1 + (lat2 - lat1) * t + jitterLat, lng1 + (lng2 - lng1) * t + jitterLng]);
    }
  }
  return path;
}

function buildPings(date, waypoints) {
  const totalMinutes = (WORK_END_H - WORK_START_H) * 60 + WORK_END_MIN;
  const totalPings = Math.floor(totalMinutes / PING_INTERVAL_MIN) + 1;
  const path = interpolatePath(waypoints, totalPings);

  const pings = [];
  for (let i = 0; i < totalPings; i++) {
    const minutesElapsed = i * PING_INTERVAL_MIN;
    const hours = WORK_START_H + Math.floor(minutesElapsed / 60);
    const mins  = minutesElapsed % 60;
    const recorded_at = `${date}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00.000Z`;
    pings.push({
      lat:         parseFloat(path[i][0].toFixed(6)),
      lng:         parseFloat(path[i][1].toFixed(6)),
      accuracy:    parseFloat((8 + Math.random() * 12).toFixed(1)), // 8–20m realistic accuracy
      recorded_at,
    });
  }
  return pings;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("✓ Connected to DB\n");

  // Fetch user IDs
  const fetchUser = async (email) =>
    (await client.query(`SELECT id FROM "User" WHERE email = $1`, [email])).rows[0]?.id;

  const users = {
    sarah:  await fetchUser("rep@kibagrep.dev"),
    ronald: await fetchUser("rep2@kibagrep.dev"),
    diana:  await fetchUser("rep3@kibagrep.dev"),
  };

  for (const [name, userId] of Object.entries(users)) {
    if (!userId) { console.log(`  skip  ${name} — user not found`); continue; }
    console.log(`── ${name} (${userId}) ──────────────────────────────`);

    const route = KAMPALA_ROUTES[name];
    let totalInserted = 0;

    for (const date of SEED_DATES) {
      // Check if we already have pings for this rep+date
      const existing = await client.query(
        `SELECT COUNT(*) FROM "LocationPing"
         WHERE user_id = $1
           AND recorded_at >= $2::timestamptz
           AND recorded_at < ($2::timestamptz + interval '1 day')`,
        [userId, date]
      );
      const existingCount = parseInt(existing.rows[0].count);
      if (existingCount > 0) {
        console.log(`  skip  ${date} — ${existingCount} pings already exist`);
        continue;
      }

      const pings = buildPings(date, route.waypoints);

      // Batch insert in chunks of 50
      let inserted = 0;
      for (let i = 0; i < pings.length; i += 50) {
        const chunk = pings.slice(i, i + 50);
        const vals = chunk.map((_, j) => {
          const n = j * 5;
          return `(gen_random_uuid()::text, $${n+1}::text, $${n+2}::float8, $${n+3}::float8, $${n+4}::float8, $${n+5}::timestamptz)`;
        }).join(", ");

        const params = [];
        for (const p of chunk) {
          params.push(userId, p.lat, p.lng, p.accuracy, p.recorded_at);
        }

        await client.query(
          `INSERT INTO "LocationPing" (id, user_id, lat, lng, accuracy, recorded_at)
           VALUES ${vals}
           ON CONFLICT DO NOTHING`,
          params
        );
        inserted += chunk.length;
      }

      totalInserted += inserted;
      console.log(`  ok    ${date} — ${inserted} pings seeded`);
    }

    console.log(`  total ${totalInserted} pings added for ${name}\n`);
  }

  // Quick summary
  const summary = await client.query(
    `SELECT u.email, COUNT(*) as ping_count, MIN(p.recorded_at) as first, MAX(p.recorded_at) as last
     FROM "LocationPing" p
     JOIN "User" u ON u.id = p.user_id
     WHERE u.email IN ('rep@kibagrep.dev','rep2@kibagrep.dev','rep3@kibagrep.dev')
     GROUP BY u.email
     ORDER BY u.email`
  );
  console.log("── LocationPing totals ───────────────────────────────");
  for (const row of summary.rows) {
    console.log(`  ${row.email}: ${row.ping_count} pings  (${row.first?.toISOString().slice(0,10)} → ${row.last?.toISOString().slice(0,10)})`);
  }

  await client.end();
  console.log("\n✓ Done");
}

main().catch(e => { console.error(e); process.exit(1); });
