/*
 * Santa Barbara Bite Forecast -- browser port
 * ============================================
 * Ports the Python bite-forecast model to run client-side. Fetches:
 *   - Open-Meteo forecast (pressure)          https://api.open-meteo.com
 *   - Open-Meteo Marine (sea temp / waves)     https://marine-api.open-meteo.com
 *   - NWS hourly forecast (wind)               https://api.weather.gov
 *   - NOAA CO-OPS tide predictions             https://api.tidesandcurrents.noaa.gov
 *   - sunrise-sunset.org (dawn/dusk)           https://api.sunrise-sunset.org
 * All five are free, no API key, and support CORS for browser use.
 *
 * NOTE: browsers block scripts from setting a custom User-Agent header
 * (it's on the forbidden-header list), so unlike the Python version we
 * can't self-identify to NWS with a contact email -- the browser sends
 * its own UA automatically, which NWS's public API accepts fine for
 * light personal use.
 *
 * NOTE: timestamps assume the browser's local timezone is US Pacific,
 * same as the Python version assumed the machine running it was. If
 * you view this page from another timezone, the hour labels/lookups
 * will be off.
 *
 * This is folklore + general species knowledge encoded as heuristics,
 * not a live catch database. Tune SPECIES/LOCATIONS below as you learn
 * what actually works.
 */

const TIDE_STATION = "9411340"; // NOAA Santa Barbara / Stearns Wharf tide station

const LOCATIONS = {
  goleta_pier: {
    label: "Goleta Pier",
    type: "pier",
    lat: 34.4262,
    lon: -119.8404,
  },
  stearns_wharf: {
    label: "Stearns Wharf",
    type: "pier",
    lat: 34.4064,
    lon: -119.6857,
  },
  haskells_beach: {
    label: "Haskell's Beach",
    type: "beach",
    lat: 34.42673,
    lon: -119.90977,
  },
  arroyo_burro_beach: {
    label: "Arroyo Burro Beach (Hendry's)",
    type: "beach",
    lat: 34.40295,
    lon: -119.74397,
  },
};

const WEIGHTS = {
  pressure_trend: 3.0,
  tide_movement: 3.5,
  low_light: 2.5,
  wind: 1.0,
};

const SPECIES = [
  {
    name: "Barred / Walleye Surfperch",
    tempRange: [50, 68],
    tidePref: { incoming: 1.0, outgoing: 0.75 },
    lightPref: { low: 0.85, day: 1.0 },
    zone: "Close to structure/surf line -- inshore third of a pier, or right in the surf wash at a beach",
    depth: "3-10 ft",
    rig: "High/low leader rig, size 6-8 hooks",
    baitLure: "Fresh mussel, ghost shrimp, or sand crab",
    locationBonus: { goleta_pier: 1.1, stearns_wharf: 1.0, haskells_beach: 1.3, arroyo_burro_beach: 1.3 },
  },
  {
    name: "White Croaker (Tomcod)",
    tempRange: [48, 62],
    tidePref: { incoming: 0.8, outgoing: 1.0 },
    lightPref: { low: 1.0, day: 0.6 },
    zone: "Sandy bottom, mid-depth -- mid-pier, or a surf-zone trough at a beach",
    depth: "8-15 ft",
    rig: "High/low rig, size 4-6 hooks, add bait scent",
    baitLure: "Mussel, bloodworm, or squid strip",
    locationBonus: { goleta_pier: 1.0, stearns_wharf: 1.0, haskells_beach: 1.2, arroyo_burro_beach: 1.2 },
  },
  {
    name: "Jacksmelt",
    tempRange: [55, 65],
    tidePref: { incoming: 1.0, outgoing: 0.6 },
    lightPref: { low: 0.7, day: 1.0 },
    zone: "Surface to mid-water, right along the pilings",
    depth: "Surface-6 ft",
    rig: "Size 10-12 hooks under a small float, or a multi-hook bait-fly rig",
    baitLure: "Tiny pieces of mussel/bait fly, no added weight",
    locationBonus: { goleta_pier: 1.0, stearns_wharf: 1.1, haskells_beach: 0.8, arroyo_burro_beach: 0.8 },
  },
  {
    name: "Pacific / Jack Mackerel",
    tempRange: [60, 72],
    tidePref: { incoming: 0.8, outgoing: 0.8 },
    lightPref: { low: 1.0, day: 0.7 },
    zone: "Open water off the end, schools cruise mid-depth",
    depth: "10-25 ft, mid-water column",
    rig: "Sabiki rig (multi-hook, no bait), worked mid-depth",
    baitLure: "None needed for sabiki; small bait strip on plain hook as backup",
    locationBonus: { goleta_pier: 0.8, stearns_wharf: 1.3, haskells_beach: 0.4, arroyo_burro_beach: 0.4 },
  },
  {
    name: "Pacific Bonito",
    tempRange: [64, 75],
    tidePref: { incoming: 0.7, outgoing: 1.0 },
    lightPref: { low: 1.0, day: 0.8 },
    zone: "Far end, open deeper water, chasing bait schools",
    depth: "15-30+ ft",
    rig: "Castable metal jig (Krocodile/Kastmaster) worked fast, or live bait under a slider float",
    baitLure: "Live anchovy/sardine, or a flashy metal jig",
    locationBonus: { goleta_pier: 0.5, stearns_wharf: 1.4, haskells_beach: 0.2, arroyo_burro_beach: 0.2 },
  },
  {
    name: "California Halibut",
    tempRange: [55, 68],
    tidePref: { incoming: 0.6, outgoing: 1.0 },
    lightPref: { low: 0.9, day: 0.8 },
    zone: "Sandy bottom, deeper edges -- pier's far end/deep pilings, or a surf-zone trough/dropoff at a beach",
    depth: "12-25 ft at a pier; often just past the breakers (6-15 ft) in the surf",
    rig: "Sliding sinker (fish-finder) rig, 2/0-4/0 hook, slow-dragged along bottom",
    baitLure: "Live anchovy/smelt if available, otherwise cut bait strip or curly-tail swimbait",
    locationBonus: { goleta_pier: 0.6, stearns_wharf: 1.2, haskells_beach: 1.3, arroyo_burro_beach: 1.3 },
  },
  {
    name: "Leopard Shark / Bat Ray",
    tempRange: [55, 70],
    tidePref: { incoming: 0.7, outgoing: 0.9 },
    lightPref: { low: 1.0, day: 0.4 },
    zone: "Deep water near the end pilings, especially after dark",
    depth: "10-25 ft, on bottom",
    rig: "Carolina/sliding sinker rig, 30-40 lb leader, 2/0-5/0 circle hook",
    baitLure: "Squid strip or mackerel chunk",
    locationBonus: { goleta_pier: 0.9, stearns_wharf: 1.1, haskells_beach: 1.0, arroyo_burro_beach: 1.0 },
  },
  {
    name: "Kelp / Sand Bass",
    tempRange: [58, 70],
    tidePref: { incoming: 0.6, outgoing: 1.0 },
    lightPref: { low: 0.8, day: 0.7 },
    zone: "Tight to structure/pilings in the deeper sections",
    depth: "8-20 ft, near structure",
    rig: "1/4-1/2 oz jighead with swimbait, or a live-bait dropper loop",
    baitLure: "Plastic swimbait, or live bait (small anchovy/perch)",
    locationBonus: { goleta_pier: 0.7, stearns_wharf: 1.1, haskells_beach: 0.5, arroyo_burro_beach: 0.6 },
  },
  {
    name: "California Corbina",
    tempRange: [60, 75],
    tidePref: { incoming: 1.0, outgoing: 0.6 },
    lightPref: { low: 0.6, day: 1.0 },
    zone: "Right in the wash / first trough, cruising with the waves hunting sand crabs",
    depth: "0-3 ft (surf wash)",
    rig: "Light fish-finder or split-shot rig, 1-2oz weight, size 4-6 hook, cast just past the breakers",
    baitLure: "Fresh sand crab (the classic corbina bait), tipped with bloodworm if available",
    locationBonus: { goleta_pier: 0.1, stearns_wharf: 0.1, haskells_beach: 1.4, arroyo_burro_beach: 1.4 },
  },
];

document.addEventListener("DOMContentLoaded", () => {
  renderPlaybook();

  const locationSelect =
    document.getElementById("location-select");

  if (locationSelect) {
    locationSelect.addEventListener("change", () => {
      if (window.currentForecastResults) {
        renderResults(window.currentForecastResults);
      }
    });
  }

  document
    .getElementById("check-btn")
    .addEventListener("click", runForecast);
});

const ABUNDANT_THRESHOLD = 8.0;

// ---------------------------------------------------------------- utils --

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function nearestPoint(series, targetTime) {
  if (!series.length) return null;
  let best = series[0];
  let bestDiff = Math.abs(series[0].time.getTime() - targetTime.getTime());
  for (const p of series) {
    const diff = Math.abs(p.time.getTime() - targetTime.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return best;
}

function nearestValue(series, targetTime) {
  const p = nearestPoint(series, targetTime);
  return p ? p.value : null;
}

// -------------------------------------------------------------- fetchers --

async function fetchPressureSeries(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=surface_pressure&timezone=auto&past_days=2&forecast_days=3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Pressure forecast request failed (Open-Meteo)");
  const data = await res.json();
  const times = data.hourly.time;
  const vals = data.hourly.surface_pressure;
  return times
    .map((t, i) => ({ time: new Date(t), value: vals[i] }))
    .filter((p) => p.value !== null && p.value !== undefined);
}

async function fetchMarineConditions(lat, lon) {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=sea_surface_temperature,wave_height&temperature_unit=fahrenheit&timezone=auto&forecast_days=3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Marine forecast request failed (Open-Meteo Marine)");
  const data = await res.json();
  const times = data.hourly.time || [];
  const temps = data.hourly.sea_surface_temperature || [];
  const waves = data.hourly.wave_height || [];
  const tempSeries = [];
  const waveSeries = [];
  times.forEach((t, i) => {
    const d = new Date(t);
    if (temps[i] !== null && temps[i] !== undefined) tempSeries.push({ time: d, value: temps[i] });
    if (waves[i] !== null && waves[i] !== undefined) waveSeries.push({ time: d, value: waves[i] * 3.28084 });
  });
  return { tempSeries, waveSeries };
}

async function fetchForecastHourly(lat, lon) {
  const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: { Accept: "application/geo+json" },
  });
  if (!pointsRes.ok) throw new Error("NWS points lookup failed");
  const pointsData = await pointsRes.json();
  const hourlyUrl = pointsData.properties.forecastHourly;
  const hourlyRes = await fetch(hourlyUrl, { headers: { Accept: "application/geo+json" } });
  if (!hourlyRes.ok) throw new Error("NWS hourly forecast request failed");
  const hourlyData = await hourlyRes.json();
  return hourlyData.properties.periods;
}

async function fetchTidePredictions(station, days = 2) {
  const begin = formatYYYYMMDD(new Date());
  const end = formatYYYYMMDD(addDays(new Date(), days));
  const params = new URLSearchParams({
    product: "predictions",
    application: "SBPierBiteForecastWeb",
    begin_date: begin,
    end_date: end,
    datum: "MLLW",
    station,
    time_zone: "lst_ldt",
    units: "english",
    interval: "hilo",
    format: "json",
  });
  const res = await fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params.toString()}`);
  if (!res.ok) throw new Error("NOAA tide prediction request failed");
  const data = await res.json();
  return data.predictions || [];
}

async function fetchSunTimes(lat, lon) {
  const res = await fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`);
  if (!res.ok) throw new Error("Sunrise/sunset request failed");
  const data = await res.json();
  return { sunrise: new Date(data.results.sunrise), sunset: new Date(data.results.sunset) };
}

// -------------------------------------------------------------- scoring --

function trendAt(targetTime, pressureSeries, windowHours = 3) {
  if (!pressureSeries.length) return null;
  const tEnd = nearestPoint(pressureSeries, targetTime);
  const tStart = nearestPoint(pressureSeries, new Date(targetTime.getTime() - windowHours * 3600000));
  if (!tEnd || !tStart || tEnd.time.getTime() === tStart.time.getTime()) return null;
  const hrs = (tEnd.time.getTime() - tStart.time.getTime()) / 3600000;
  if (hrs <= 0) return null;
  return (tEnd.value - tStart.value) / hrs;
}

function scorePressure(trendHpaPerHr) {
  if (trendHpaPerHr === null || trendHpaPerHr === undefined) return [0, "no pressure trend data"];
  if (trendHpaPerHr < -0.5) return [10, "pressure falling steadily (often triggers active feeding)"];
  if (trendHpaPerHr < -0.1) return [7, "pressure slowly falling"];
  if (trendHpaPerHr <= 0.1) return [6, "pressure steady"];
  if (trendHpaPerHr <= 0.6) return [3, "pressure slowly rising"];
  return [1, "pressure rising fast (often slows the bite)"];
}

function parseTideTime(t) {
  // "YYYY-MM-DD HH:MM" -> treated as local (matches lst_ldt request param)
  return new Date(t.replace(" ", "T"));
}

function scoreTideMovement(targetTime, tideEvents) {
  if (!tideEvents.length) return [0, "no tide data", 0.5, "unknown"];
  const parsed = tideEvents
    .map((e) => ({ time: parseTideTime(e.t), type: e.type }))
    .sort((a, b) => a.time - b.time);

  const before = parsed.filter((p) => p.time <= targetTime);
  const after = parsed.filter((p) => p.time > targetTime);
  if (!before.length || !after.length) return [4, "near edge of tide data window", 0.5, "unknown"];

  const prev = before[before.length - 1];
  const next = after[0];
  const totalSpan = (next.time - prev.time) / 3600000;
  const hrsFromPrev = (targetTime - prev.time) / 3600000;
  const frac = totalSpan ? hrsFromPrev / totalSpan : 0.5;

  const incoming = prev.type === "L" && next.type === "H";
  const midBonus = 1 - Math.abs(frac - 0.5) * 2;
  let score = 4 + midBonus * 5;
  const tideDesc = incoming ? "incoming" : "outgoing";
  const tideLabel = incoming ? "incoming tide (bait pushed toward the pier)" : "outgoing tide";
  if (incoming) score += 1;
  score = Math.min(score, 10);
  return [Math.round(score * 10) / 10, `${tideLabel}, ${Math.round(frac * 100)}% through the swing`, frac, tideDesc];
}

function scoreLowLight(targetTime, sunrise, sunset) {
  const near = (t, center, windowMin = 75) => Math.abs(t.getTime() - center.getTime()) <= windowMin * 60000;
  if (near(targetTime, sunrise) || near(targetTime, sunset)) return [10, "within dawn/dusk feeding window"];
  const hour = targetTime.getHours();
  if (hour < sunrise.getHours() || hour > sunset.getHours()) return [4, "night / low light"];
  return [3, "full daylight (slower bite typically)"];
}

function scoreWind(windMph) {
  if (windMph === null || windMph === undefined) return [5, "no wind data"];
  if (windMph <= 12) return [8, `light wind (${Math.round(windMph)} mph)`];
  if (windMph <= 20) return [5, `moderate wind (${Math.round(windMph)} mph)`];
  return [2, `strong wind (${Math.round(windMph)} mph, tough fishing)`];
}

function recommendSpotPier(tideDesc, tideFrac, isLowLight, windDir) {
  const parts = [];
  if (tideDesc === "outgoing") {
    parts.push("outgoing tide: work the far end (deeper water) &mdash; current is pulling bait out past the end and predators follow it");
  } else {
    parts.push("incoming tide: work the inshore third &mdash; incoming water pushes bait toward the beach, drawing fish in close");
  }
  if (Math.abs(tideFrac - 0.5) < 0.18) {
    parts.push("current is moving fastest right now, so fish tight to the pilings where eddies form and fish stack up");
  }
  if (isLowLight) {
    parts.push("low light also pulls bigger fish shallow, so the surf zone at the base is worth a cast");
  } else {
    parts.push("in full daylight fish hold deeper/in shade under the decking &mdash; favor the far end and shaded pilings");
  }
  if (windDir) {
    parts.push(`wind is out of the ${windDir}, so fish from that side so bait/chum drifts naturally in under the pier`);
  }
  return parts.join("; ");
}

function recommendSpotBeach(tideDesc, tideFrac, isLowLight, windDir) {
  const parts = [];
  if (tideDesc === "outgoing") {
    parts.push("outgoing tide: walk the beach and look for troughs/holes revealed as the water drops &mdash; draining water concentrates bait in these channels");
  } else {
    parts.push("incoming tide: fish close to the wash/first drop-off &mdash; rising water pushes sand crabs and baitfish right up onto the beach");
  }
  if (Math.abs(tideFrac - 0.5) < 0.18) {
    parts.push("current is moving fastest right now, so a rip channel will be running strong &mdash; cast the calmer edges of it, not straight into the rip");
  }
  if (isLowLight) {
    parts.push("low light pulls bigger fish right into the shallow wash, so don't wade out &mdash; fish close");
  } else {
    parts.push("in full daylight favor any deeper trough, rocky point, or patch of structure over featureless flat sand");
  }
  if (windDir) {
    parts.push(`wind is out of the ${windDir}; if it's blowing onshore it's stirring up sand crabs/worms in the wash &mdash; a good sign, just add weight to hold bottom`);
  }
  return parts.join("; ");
}

function recommendSpot(locType, tideDesc, tideFrac, isLowLight, windDir) {
  return locType === "beach"
    ? recommendSpotBeach(tideDesc, tideFrac, isLowLight, windDir)
    : recommendSpotPier(tideDesc, tideFrac, isLowLight, windDir);
}

function speciesAbundance(species, waterTempF, tideDesc, isLowLight, locationKey) {
  const [lo, hi] = species.tempRange;
  let tempFactor;
  if (waterTempF === null || waterTempF === undefined) {
    tempFactor = 0.7;
  } else if (waterTempF >= lo && waterTempF <= hi) {
    const mid = (lo + hi) / 2;
    const span = (hi - lo) / 2;
    tempFactor = 1.0 - (Math.abs(waterTempF - mid) / span) * 0.3;
  } else {
    const dist = Math.min(Math.abs(waterTempF - lo), Math.abs(waterTempF - hi));
    tempFactor = Math.max(0.15, 0.6 - dist * 0.05);
  }
  const tideFactor = species.tidePref[tideDesc] ?? 0.7;
  const lightFactor = species.lightPref[isLowLight ? "low" : "day"];
  const pierFactor = species.locationBonus[locationKey] ?? 1.0;
  const raw = tempFactor * tideFactor * lightFactor * pierFactor;
  return Math.round(Math.min(raw * 10, 10) * 10) / 10;
}

// ------------------------------------------------------------- pipeline --

async function scoreLocationHours(locKey, loc, tideEvents) {
  const [pressureSeries, marine, hourly, sun] = await Promise.all([
    fetchPressureSeries(loc.lat, loc.lon),
    fetchMarineConditions(loc.lat, loc.lon),
    fetchForecastHourly(loc.lat, loc.lon),
    fetchSunTimes(loc.lat, loc.lon),
  ]);
  const { tempSeries } = marine;
  const { sunrise, sunset } = sun;

  const results = [];
  for (const period of hourly.slice(0, 48)) {
    const start = new Date(period.startTime);
    const windMatch = (period.windSpeed || "").match(/[\d.]+/);
    const windMph = windMatch ? parseFloat(windMatch[0]) : null;

    const trend = trendAt(start, pressureSeries);
    const [pScore, pReason] = scorePressure(trend);
    const [tScore, tReason, tFrac, tDesc] = scoreTideMovement(start, tideEvents);
    const [lScore, lReason] = scoreLowLight(start, sunrise, sunset);
    const [wScore, wReason] = scoreWind(windMph);

    const isLowLight = lReason.includes("night") || lReason.includes("dawn/dusk");
    const windDir = period.windDirection || "";
    const spotAdvice = recommendSpot(loc.type, tDesc, tFrac, isLowLight, windDir);

    const waterTempF = nearestValue(tempSeries, start);

    const abundant = SPECIES.map((sp) => ({
      name: sp.name,
      score: speciesAbundance(sp, waterTempF, tDesc, isLowLight, locKey),
      sp,
    }))
      .filter((a) => a.score >= ABUNDANT_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const total =
      (pScore * WEIGHTS.pressure_trend +
        tScore * WEIGHTS.tide_movement +
        lScore * WEIGHTS.low_light +
        wScore * WEIGHTS.wind) /
      (WEIGHTS.pressure_trend + WEIGHTS.tide_movement + WEIGHTS.low_light + WEIGHTS.wind);

    results.push({
      time: start,
      location: loc.label,
      locationKey: locKey,
      score: Math.round(total * 10) / 10,
      reasons: [pReason, tReason, lReason, wReason],
      spotAdvice,
      abundant,
    });
  }
  return results;
}

async function runForecast() {
  const btn = document.getElementById("check-btn");
  const status = document.getElementById("status");
  const resultsSection = document.getElementById("results");
  const errorSection = document.getElementById("error");

  btn.disabled = true;
  errorSection.hidden = true;
  resultsSection.hidden = true;
  status.textContent = "Fetching tide predictions...";

  try {
    const tideEvents = await fetchTidePredictions(TIDE_STATION, 2);

    let allResults = [];
    for (const [key, loc] of Object.entries(LOCATIONS)) {
      status.textContent = `Fetching conditions for ${loc.label}...`;
      const locResults = await scoreLocationHours(key, loc, tideEvents);
      allResults = allResults.concat(locResults);
    }

    status.textContent = "";
    window.currentForecastResults = allResults;
    renderResults(allResults);
  } catch (err) {
    console.error(err);
    showError(err);
  } finally {
    btn.disabled = false;
  }
}

// -------------------------------------------------------------- render --

function showError(err) {
  const errorSection = document.getElementById("error");
  errorSection.hidden = false;
  errorSection.innerHTML = `
    <strong>Couldn't finish the forecast.</strong>
    <p>${err.message || "An unknown error occurred."}</p>
    <p>This is usually a network hiccup or one of the free data sources being briefly unavailable. Try the button again in a moment.</p>
  `;
}

function formatTime(date) {
  return date.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scoreBarClass(score) {
  return score >= 7 ? "high" : "";
}

function renderResults(allResults) {
  const resultsSection = document.getElementById("results");
  const list = document.getElementById("results-list");
  const pressureNote = document.getElementById("pressure-note");

  list.innerHTML = "";

  const locationSelect = document.getElementById("location-select");
  const selectedLocation = locationSelect
    ? locationSelect.value
    : "all";

  // Filter before ranking.
  const filteredResults =
    selectedLocation === "all"
      ? allResults
      : allResults.filter(
          (r) => r.locationKey === selectedLocation
        );

  // Chronological scan across the currently selected location(s).
  const chrono = [...filteredResults].sort(
    (a, b) => a.time - b.time
  );

  const firstFalling = chrono.find((r) =>
    r.reasons.some((reason) => reason.includes("falling"))
  );

  if (firstFalling) {
    pressureNote.textContent =
      `Pressure looks set to start falling around ${formatTime(
        firstFalling.time
      )} at ${firstFalling.location} (current model run).`;
  } else if (filteredResults.length) {
    pressureNote.textContent =
      "No falling pressure in this 48h window for the selected location.";
  } else {
    pressureNote.textContent = "";
  }

  const ranked = [...filteredResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  ranked.forEach((r, i) => {
    const card = document.createElement("article");

    card.className =
      "window-card" + (i < 3 ? " featured" : "");

    const reasonsHtml = r.reasons
      .map((reason) => `<li>${reason}</li>`)
      .join("");

    let abundantHtml = "";

    if (r.abundant.length) {
      const items = r.abundant
        .slice(0, 3)
        .map(
          (a) => `
          <div class="abundant-item">
            <span class="sp-name">&#128293; ${a.name}</span>
            (${a.score}/10)

            <div class="sp-detail-text">
              ${a.sp.zone},
              ${a.sp.depth},
              ${a.sp.rig},
              bait/lure: ${a.sp.baitLure}
            </div>
          </div>
        `
        )
        .join("");

      abundantHtml = `
        <div class="abundant-block">
          <p class="abundant-title">
            Likely abundant right now
          </p>
          ${items}
        </div>
      `;
    } else {
      abundantHtml = `
        <p class="no-standout">
          No species clearly standing out this hour
          &mdash; work the general strategy above.
        </p>
      `;
    }

    card.innerHTML = `
      <div class="window-head">
        <div>
          <div class="window-time">
            ${formatTime(r.time)}
          </div>

          <div class="window-location">
            ${r.location}
          </div>
        </div>

        <div class="window-score">
          ${r.score}/10
        </div>
      </div>

      <div class="score-bar-track">
        <div
          class="score-bar-fill ${scoreBarClass(r.score)}"
          style="width:${r.score * 10}%">
        </div>
      </div>

      <ul class="reason-list">
        ${reasonsHtml}
      </ul>

      <p class="spot-advice">
        <strong>Where to fish:</strong>
        ${r.spotAdvice}
      </p>

      ${abundantHtml}
    `;

    list.appendChild(card);
  });

  resultsSection.hidden = false;

  resultsSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function bestLocationLabel(species) {
  let bestKey = null;
  let bestVal = -Infinity;
  for (const [key, val] of Object.entries(species.locationBonus)) {
    if (val > bestVal) {
      bestVal = val;
      bestKey = key;
    }
  }
  return LOCATIONS[bestKey] ? LOCATIONS[bestKey].label : "";
}

function renderPlaybook() {
  const container = document.getElementById("playbook-list");
  container.innerHTML = "";

  SPECIES.forEach((sp) => {
    const row = document.createElement("div");
    row.className = "sp-row";
    const [lo, hi] = sp.tempRange;
    const tidePrefLabel = sp.tidePref.incoming >= sp.tidePref.outgoing ? "incoming" : "outgoing";
    const lightPrefLabel = sp.lightPref.low >= sp.lightPref.day ? "low light" : "daylight";

    row.innerHTML = `
      <div class="sp-head">
        <h3>${sp.name}</h3>
        <span class="sp-best">best spot: ${bestLocationLabel(sp)}</span>
      </div>
      <dl class="sp-detail">
        <dt>Zone</dt><dd>${sp.zone}</dd>
        <dt>Depth</dt><dd>${sp.depth}</dd>
        <dt>Rig/lure</dt><dd>${sp.rig}</dd>
        <dt>Bait/lure</dt><dd>${sp.baitLure}</dd>
        <dt>Favors</dt><dd>water temp ${lo}-${hi}&deg;F, ${tidePrefLabel} tide, ${lightPrefLabel}</dd>
      </dl>
    `;
    container.appendChild(row);
  });
}

// ------------------------------------------------------------------ init --

document.addEventListener("DOMContentLoaded", () => {
  renderPlaybook();
  document.getElementById("check-btn").addEventListener("click", runForecast);
});