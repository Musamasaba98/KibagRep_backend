import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Haversine distance in metres
function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST /api/location/batch
// Rep device posts an array of GPS pings. Accepts up to 200 per call.
export const batchPings = asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  const { pings } = req.body;

  if (!Array.isArray(pings) || pings.length === 0) {
    res.status(400);
    throw new Error("pings must be a non-empty array");
  }

  const capped = pings.slice(0, 200);

  const data = capped
    .filter(p => p.lat != null && p.lng != null && p.recorded_at)
    .map(p => ({
      user_id,
      lat:         parseFloat(p.lat),
      lng:         parseFloat(p.lng),
      accuracy:    p.accuracy != null ? parseFloat(p.accuracy) : null,
      recorded_at: new Date(p.recorded_at),
    }));

  if (data.length === 0) {
    res.status(400);
    throw new Error("No valid pings in payload");
  }

  await prisma.locationPing.createMany({ data, skipDuplicates: true });

  res.status(201).json({ success: true, saved: data.length });
});

// GET /api/location/trail/:userId?date=YYYY-MM-DD
// Supervisor fetches a rep's GPS trail for a given day (defaults to today).
export const getTrail = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const dateParam = req.query.date;

  const day = dateParam ? new Date(dateParam) : new Date();
  day.setHours(0, 0, 0, 0);
  const nextDay = new Date(day);
  nextDay.setDate(nextDay.getDate() + 1);

  const pings = await prisma.locationPing.findMany({
    where: {
      user_id:     userId,
      recorded_at: { gte: day, lt: nextDay },
    },
    orderBy: { recorded_at: "asc" },
    select:  { lat: true, lng: true, accuracy: true, recorded_at: true },
  });

  // Annotate suspicious pings: perfect 0m accuracy = likely mock GPS
  const annotated = pings.map(p => ({
    ...p,
    mock_flag: p.accuracy !== null && p.accuracy === 0,
  }));

  // Speed anomaly detection — flag any pair of consecutive pings that imply
  // travel faster than 120 km/h (a legitimate rep can't do that on Kampala roads)
  const MAX_SPEED_MS = 120_000 / 3600; // 33.3 m/s
  for (let i = 1; i < annotated.length; i++) {
    const prev = annotated[i - 1];
    const curr = annotated[i];
    const secs = (new Date(curr.recorded_at) - new Date(prev.recorded_at)) / 1000;
    if (secs > 0) {
      const dist = distanceMetres(prev.lat, prev.lng, curr.lat, curr.lng);
      if (dist / secs > MAX_SPEED_MS) curr.speed_anomaly = true;
    }
  }

  res.status(200).json({ success: true, data: annotated, count: annotated.length });
});

// GET /api/location/my-trail?date=YYYY-MM-DD
// Rep fetches their own trail for today (for their home screen map card).
export const getMyTrail = asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  const dateParam = req.query.date;

  const day = dateParam ? new Date(dateParam) : new Date();
  day.setHours(0, 0, 0, 0);
  const nextDay = new Date(day);
  nextDay.setDate(nextDay.getDate() + 1);

  const pings = await prisma.locationPing.findMany({
    where: { user_id, recorded_at: { gte: day, lt: nextDay } },
    orderBy: { recorded_at: "asc" },
    select:  { lat: true, lng: true, recorded_at: true },
  });

  res.status(200).json({ success: true, data: pings });
});

// GET /api/location/team-last-seen
// Supervisor/Manager: latest ping per rep in their team, with online status.
export const getTeamLastSeen = asyncHandler(async (req, res) => {
  const { role, id: callerId } = req.user;
  const currentUser = await prisma.user.findUnique({
    where: { id: callerId },
    select: { company_id: true },
  });
  if (!currentUser?.company_id) return res.status(200).json({ success: true, data: [] });

  const { company_id } = currentUser;
  let repIds;

  if (role === 'Supervisor') {
    const myTeams = await prisma.team.findMany({
      where: { supervisor_id: callerId, company_id },
      select: { id: true },
    });
    if (myTeams.length === 0) return res.status(200).json({ success: true, data: [] });
    const reps = await prisma.user.findMany({
      where: { team_id: { in: myTeams.map(t => t.id) }, company_id, role: 'MedicalRep' },
      select: { id: true, firstname: true, lastname: true },
    });
    repIds = reps.map(r => r.id);
    // Attach name info for response
    var repMap = Object.fromEntries(reps.map(r => [r.id, r]));
  } else {
    const reps = await prisma.user.findMany({
      where: { company_id, role: 'MedicalRep' },
      select: { id: true, firstname: true, lastname: true },
    });
    repIds = reps.map(r => r.id);
    var repMap = Object.fromEntries(reps.map(r => [r.id, r]));
  }

  if (repIds.length === 0) return res.status(200).json({ success: true, data: [] });

  // Get the latest ping for each rep in one query using DISTINCT ON
  const latestPings = await prisma.$queryRaw`
    SELECT DISTINCT ON (user_id)
      user_id, lat, lng, accuracy, recorded_at
    FROM "LocationPing"
    WHERE user_id = ANY(${repIds})
    ORDER BY user_id, recorded_at DESC
  `;

  const now = Date.now();
  const result = repIds.map(id => {
    const rep = repMap[id];
    const ping = latestPings.find(p => p.user_id === id);
    const lastSeenMs = ping ? new Date(ping.recorded_at).getTime() : null;
    return {
      user_id:    id,
      firstname:  rep.firstname,
      lastname:   rep.lastname,
      last_ping:  ping ? {
        lat:         parseFloat(ping.lat),
        lng:         parseFloat(ping.lng),
        recorded_at: ping.recorded_at,
      } : null,
      is_online:  lastSeenMs != null && (now - lastSeenMs) < ONLINE_THRESHOLD_MS,
      last_seen_ms: lastSeenMs,
    };
  });

  res.status(200).json({ success: true, data: result });
});
