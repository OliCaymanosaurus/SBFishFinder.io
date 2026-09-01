const LOCATIONS = {
  goleta_pier: {
    label: "Goleta Pier",
    lat: 34.4262,
    lon: -119.8404,
  },

  stearns_wharf: {
    label: "Stearns Wharf",
    lat: 34.4064,
    lon: -119.6857,
  },

  haskells_beach: {
    label: "Haskell's Beach",
    lat: 34.42673,
    lon: -119.90977,
  },

  arroyo_burro_beach: {
    label: "Hendry's Beach",
    lat: 34.40295,
    lon: -119.74397,
  },
};

const TIDE_STATION = "9411340";

let charts = {};

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTime(date) {
  return date.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}


/* ------------------------------------------------------------
   DATA
------------------------------------------------------------ */

async function fetchPressure(lat, lon) {

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=surface_pressure` +
    `&timezone=auto` +
    `&past_days=2` +
    `&forecast_days=1`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Pressure request failed.");
  }

  const data = await res.json();

  return data.hourly.time.map((t, i) => ({
    time: new Date(t),
    value: data.hourly.surface_pressure[i],
  }));
}


async function fetchMarine(lat, lon) {

  const url =
    `https://marine-api.open-meteo.com/v1/marine` +
    `?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=sea_surface_temperature,wave_height` +
    `&temperature_unit=fahrenheit` +
    `&timezone=auto` +
    `&forecast_days=3`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Marine request failed.");
  }

  const data = await res.json();

  return data.hourly.time.map((t, i) => ({
    time: new Date(t),
    water:
      data.hourly.sea_surface_temperature[i],
    wave:
      data.hourly.wave_height[i] * 3.28084,
  }));
}


async function fetchWind(lat, lon) {

  const pointsRes = await fetch(
    `https://api.weather.gov/points/${lat},${lon}`,
    {
      headers: {
        Accept: "application/geo+json",
      },
    }
  );

  if (!pointsRes.ok) {
    throw new Error("NWS location request failed.");
  }

  const points = await pointsRes.json();

  const hourlyRes = await fetch(
    points.properties.forecastHourly,
    {
      headers: {
        Accept: "application/geo+json",
      },
    }
  );

  if (!hourlyRes.ok) {
    throw new Error("NWS wind request failed.");
  }

  const data = await hourlyRes.json();

  return data.properties.periods
    .slice(0, 48)
    .map((p) => {

      const match =
        (p.windSpeed || "").match(/[\d.]+/);

      return {
        time: new Date(p.startTime),
        speed: match
          ? parseFloat(match[0])
          : null,
        direction:
          p.windDirection || "",
      };
    });
}


function formatYYYYMMDD(date) {

  const y = date.getFullYear();

  const m =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const d =
    String(date.getDate())
      .padStart(2, "0");

  return `${y}${m}${d}`;
}


async function fetchTides() {

  const today = new Date();

  const tomorrow =
    new Date(today);

  tomorrow.setDate(
    tomorrow.getDate() + 1
  );

  const params =
    new URLSearchParams({
      product: "predictions",
      application: "SBPierBiteForecastWeb",
      begin_date: formatYYYYMMDD(today),
      end_date: formatYYYYMMDD(tomorrow),
      datum: "MLLW",
      station: TIDE_STATION,
      time_zone: "lst_ldt",
      units: "english",
      interval: "hilo",
      format: "json",
    });

  const res = await fetch(
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`
  );

  if (!res.ok) {
    throw new Error("Tide request failed.");
  }

  const data = await res.json();

  return (data.predictions || []).map((p) => ({
    time: new Date(p.t.replace(" ", "T")),
    height: parseFloat(p.v),
    type: p.type,
  }));
}


/* ------------------------------------------------------------
   HELPERS
------------------------------------------------------------ */

function destroyChart(name) {

  if (charts[name]) {
    charts[name].destroy();
  }
}


function makeChart(name, canvasId, type, labels, data, label) {

  destroyChart(name);

  charts[name] =
    new Chart(
      document.getElementById(canvasId),
      {
        type,

        data: {
          labels,

          datasets: [{
            label,
            data,

            tension: 0.25,

            borderWidth: 2,

            pointRadius: 2,

            fill: false,
          }],
        },

        options: {

          responsive: true,

          maintainAspectRatio: false,

          interaction: {
            intersect: false,
            mode: "index",
          },

          plugins: {
            legend: {
              display: false,
            },
          },

          scales: {
            x: {
              ticks: {
                maxTicksLimit: 8,
              },
            },

            y: {
              beginAtZero: false,
            },
          },
        },
      }
    );
}


/* ------------------------------------------------------------
   CURRENT CONDITIONS
------------------------------------------------------------ */

function renderCurrent(
  pressure,
  wind,
  marine,
  tides
) {

  const now = new Date();

  const nearest = (series, getTime) => {

    if (!series.length) return null;

    return series.reduce(
      (best, item) => {

        const diff =
          Math.abs(
            getTime(item) - now
          );

        if (!best) return item;

        return diff <
          Math.abs(
            getTime(best) - now
          )
          ? item
          : best;
      },
      null
    );
  };


  const currentPressure =
    nearest(
      pressure,
      x => x.time
    );

  const currentWind =
    nearest(
      wind,
      x => x.time
    );

  const currentMarine =
    nearest(
      marine,
      x => x.time
    );


  document.getElementById(
    "current-pressure"
  ).textContent =
    currentPressure?.value != null
      ? `${Math.round(currentPressure.value)} hPa`
      : "—";


  document.getElementById(
    "current-wind"
  ).textContent =
    currentWind?.speed != null
      ? `${Math.round(currentWind.speed)} mph`
      : "—";


  document.getElementById(
    "current-wind-direction"
  ).textContent =
    currentWind?.direction || "—";


  document.getElementById(
    "current-water"
  ).textContent =
    currentMarine?.water != null
      ? `${currentMarine.water.toFixed(1)}°F`
      : "—";


  document.getElementById(
    "current-wave"
  ).textContent =
    currentMarine?.wave != null
      ? `${currentMarine.wave.toFixed(1)} ft`
      : "—";


  document.getElementById(
    "updated-time"
  ).textContent =
    formatTime(now);


  /*
     Tide is based on the two nearest tide events.
  */

  if (tides.length) {

    let nextIndex =
      tides.findIndex(
        t => t.time > now
      );

    if (nextIndex < 0) {
      nextIndex = tides.length - 1;
    }

    const next =
      tides[nextIndex];

    const previous =
      tides[Math.max(0, nextIndex - 1)];


    document.getElementById(
      "current-tide"
    ).textContent =
      `${next.height.toFixed(1)} ft`;


    const rising =
      previous &&
      next.type === "H";

    document.getElementById(
      "current-tide-direction"
    ).textContent =
      rising
        ? "Incoming"
        : "Outgoing";
  }
}


/* ------------------------------------------------------------
   GRAPHS
------------------------------------------------------------ */

function renderCharts(
  pressure,
  wind,
  marine,
  tides
) {

  const pressureRecent =
    pressure.slice(-48);


  makeChart(
    "pressure",
    "pressure-chart",
    "line",

    pressureRecent.map(
      x => formatTime(x.time)
    ),

    pressureRecent.map(
      x => x.value
    ),

    "Pressure (hPa)"
  );


  makeChart(
    "wind",
    "wind-chart",
    "line",

    wind.map(
      x => formatTime(x.time)
    ),

    wind.map(
      x => x.speed
    ),

    "Wind (mph)"
  );


  makeChart(
    "water",
    "water-chart",
    "line",

    marine.map(
      x => formatTime(x.time)
    ),

    marine.map(
      x => x.water
    ),

    "Water temperature (°F)"
  );


  makeChart(
    "wave",
    "wave-chart",
    "line",

    marine.map(
      x => formatTime(x.time)
    ),

    marine.map(
      x => x.wave
    ),

    "Wave height (ft)"
  );


  makeChart(
    "tide",
    "tide-chart",
    "line",

    tides.map(
      x => formatDateTime(x.time)
    ),

    tides.map(
      x => x.height
    ),

    "Tide height (ft)"
  );
}


/* ------------------------------------------------------------
   LOAD
------------------------------------------------------------ */

async function loadConditions() {

  const select =
    document.getElementById(
      "station-select"
    );

  const status =
    document.getElementById(
      "conditions-status"
    );

  const location =
    LOCATIONS[select.value];


  status.textContent =
    `Loading ${location.label}...`;


  try {

    const [
      pressure,
      marine,
      wind,
      tides
    ] = await Promise.all([

      fetchPressure(
        location.lat,
        location.lon
      ),

      fetchMarine(
        location.lat,
        location.lon
      ),

      fetchWind(
        location.lat,
        location.lon
      ),

      fetchTides(),

    ]);


    renderCurrent(
      pressure,
      wind,
      marine,
      tides
    );


    renderCharts(
      pressure,
      wind,
      marine,
      tides
    );


    status.textContent =
      `Updated ${formatTime(new Date())}`;

  } catch (error) {

    console.error(error);

    status.textContent =
      error.message ||
      "Unable to load conditions.";
  }
}


/* ------------------------------------------------------------
   INIT
------------------------------------------------------------ */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    document
      .getElementById(
        "station-select"
      )
      .addEventListener(
        "change",
        loadConditions
      );


    document
      .getElementById(
        "refresh-conditions"
      )
      .addEventListener(
        "click",
        loadConditions
      );


    loadConditions();
  }
);