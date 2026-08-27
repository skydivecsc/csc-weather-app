import { useEffect, useRef, useState } from "react";
import { LOGIN_BASE_URL } from "../config";
import { startPolling } from "./polling";
import { WeatherContext } from "./WeatherContextValue";

const THIRTY_SECONDS = 30000;
const THREE_MINUTES = 180000;
const TEN_MINUTES = 600000;
const INITIAL_SOCKET_RETRY_MS = 1000;
const MAX_SOCKET_RETRY_MS = 30000;
const SOCKET_ACK_TIMEOUT_MS = 10000;
const WIND_LIVE_MS = 15000;
const WEATHER_LIVE_MS = 90000;
const REST_FALLBACK_MS = 90000;
const MAX_FUTURE_SKEW_MS = 30000;
const STATUS_TICK_MS = 1000;

const parseServerTime = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue < 100000000000 ? numericValue * 1000 : numericValue;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const responseServerTime = (response) =>
  parseServerTime(response.headers?.get?.("X-CSCWX-Server-Time")) ??
  parseServerTime(response.headers?.get?.("Date"));

const fetchJson = async (path, { signal }) => {
  const response = await fetch(`${LOGIN_BASE_URL}${path}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`${path} request failed with status ${response.status}`);
  }

  return response.json();
};

const fetchWindHistory = async ({ signal }) => {
  const response = await fetch(`${LOGIN_BASE_URL}/api/weather/gusts`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `/api/weather/gusts request failed with status ${response.status}`
    );
  }

  return {
    data: await response.json(),
    serverNow: responseServerTime(response),
  };
};

const formatJumprunAdjustment = (value) => {
  if (value > 0 && value < 10) {
    return `.${value}`;
  }
  if (value >= 10) {
    return `${(value * 0.1).toFixed(1)}`;
  }
  return "";
};

const isNullableFiniteNumber = (value) =>
  value === null || Number.isFinite(value);

const toFiniteNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseReceivedAt = (value, now) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed) || parsed > now + MAX_FUTURE_SKEW_MS) {
    return null;
  }

  return parsed;
};

const isWindReport = (wind) =>
  wind &&
  typeof wind.receivedAt === "string" &&
  Number.isFinite(wind.speed) &&
  isNullableFiniteNumber(wind.direction) &&
  isNullableFiniteNumber(wind.gustSpeed) &&
  (wind.variableDirection === null ||
    (Array.isArray(wind.variableDirection) &&
      wind.variableDirection.every(Number.isFinite)));

const isSkyCondition = (condition) =>
  condition &&
  typeof condition === "object" &&
  typeof condition.cloudCover === "string" &&
  isNullableFiniteNumber(condition.altitude);

const isWeatherReport = (weather) =>
  weather &&
  typeof weather.receivedAt === "string" &&
  typeof weather.metar === "string" &&
  Number.isFinite(weather.temperature) &&
  (weather.presentWeather === null ||
    typeof weather.presentWeather === "string") &&
  Array.isArray(weather.skyCondition) &&
    weather.skyCondition.length > 0 &&
    weather.skyCondition.slice(0, 3).every(isSkyCondition);

const normalizeHistoryRow = (row, now) => {
  if (!row || typeof row !== "object") {
    return null;
  }

  const measuredAt = parseReceivedAt(row.received_time, now);
  const speed = toFiniteNumber(row.wind_speed);
  const gustSpeed = toFiniteNumber(row.gust_speed);
  const direction = toFiniteNumber(row.direction);
  if (
    measuredAt === null ||
    speed === null ||
    speed < 0 ||
    gustSpeed === null ||
    gustSpeed < 0 ||
    direction === null ||
    direction < 0 ||
    direction > 360
  ) {
    return null;
  }

  return {
    ...row,
    direction,
    gust_speed: gustSpeed,
    measuredAt,
    received_time: new Date(measuredAt).toISOString(),
    wind_speed: speed,
  };
};

const ageLabel = (ageMs) => {
  const safeAgeMs = Math.max(0, ageMs || 0);
  if (safeAgeMs < 60000) {
    return `${Math.floor(safeAgeMs / 1000)}s ago`;
  }

  return `${Math.floor(safeAgeMs / 60000)}m ago`;
};

const formatWindStatusText = (status, updatedAge) => {
  if (status === "live") {
    return `LIVE — updated ${updatedAge}`;
  }
  if (status === "backup") {
    return `BACKUP WIND — 1-minute sample, updated ${updatedAge}`;
  }
  if (status === "stale") {
    return `WIND DATA STALE — last reading ${updatedAge}`;
  }
  if (status === "offline") {
    return `OFFLINE — last reading ${updatedAge}`;
  }
  if (status === "connecting") {
    return "CONNECTING TO WIND DATA";
  }

  return "WIND DATA UNAVAILABLE";
};

const WindSpeedProvider = ({ children }) => {
  const [webSocketWind, setWebSocketWind] = useState(null);
  const [restWind, setRestWind] = useState(null);
  const [socketState, setSocketState] = useState("connecting");
  const [activeSocketId, setActiveSocketId] = useState(0);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false
  );
  const [statusClock, setStatusClock] = useState(() => Date.now());
  const [weatherMeasuredAt, setWeatherMeasuredAt] = useState(null);
  const [historyLastSuccessAt, setHistoryLastSuccessAt] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const latestWebSocketWindAt = useRef(null);
  const latestWeatherAt = useRef(null);
  const socketSequence = useRef(0);
  const serverClockOffset = useRef(0);
  const [metar, setMetar] = useState(null);
  const [temp, setTemp] = useState(null);
  const [tempC, setTempC] = useState(null);
  const [skyCondition1, setSkyCondition1] = useState("");
  const [skyCondition2, setSkyCondition2] = useState("");
  const [skyCondition3, setSkyCondition3] = useState("");
  const [cloudCeiling1, setCloudCeiling1] = useState("");
  const [cloudCeiling2, setCloudCeiling2] = useState("");
  const [cloudCeiling3, setCloudCeiling3] = useState("");
  const [cloudCeilingM1, setCloudCeilingM1] = useState("");
  const [cloudCeilingM2, setCloudCeilingM2] = useState("");
  const [cloudCeilingM3, setCloudCeilingM3] = useState("");
  const [metarAbbr, setMetarAbbr] = useState("");
  const [metarDesc, setMetarDesc] = useState("");
  const [gustData, setGustData] = useState([]);
  const [darkTheme, setDarkTheme] = useState(
    localStorage.getItem("darkTheme") || "true"
  );
  const [tempSetting, setTempSetting] = useState(
    localStorage.getItem("tempSetting") || "true"
  );
  const [unitSetting, setUnitSetting] = useState(
    localStorage.getItem("unitSetting") || "true"
  );
  const [directions, setDirections] = useState({});
  const [temps, setTemps] = useState({});
  const [speeds, setSpeeds] = useState({});
  const [received, setReceived] = useState(null);
  const [dewPoint, setDewPoint] = useState(null);
  const [pressure, setPressure] = useState(null);
  const [densityAlt, setDensityAlt] = useState(null);
  const [visibility, setVisibility] = useState(null);
  const [sunset, setSunset] = useState(null);
  const [sunrise, setSunrise] = useState(null);
  const [twilight, setTwilight] = useState(null);
  const [sunset24, setSunset24] = useState(null);
  const [sunrise24, setSunrise24] = useState(null);
  const [twilight24, setTwilight24] = useState(null);
  const [jumpruns, setJumpruns] = useState([]);
  const [newSpot, setNewSpot] = useState("");
  const [newOffset, setNewOffset] = useState("");

  // Changed to yard while security feed down
  const [webcamDirection, setWebcamDirection] = useState(
    localStorage.getItem("webcamDirection") || "yard"
  );

  const [speedUnit, setSpeedUnit] = useState(
    localStorage.getItem("speedUnit") || "true"
  );

  const [timeFormat, setTimeFormat] = useState(
    localStorage.getItem("timeFormat") || "true"
  );

  const webSocketWindAge = webSocketWind
    ? Math.max(0, statusClock - webSocketWind.measuredAt)
    : null;
  const restWindAge = restWind
    ? Math.max(0, statusClock - restWind.measuredAt)
    : null;
  const webSocketWindIsFresh =
    isOnline &&
    socketState === "connected" &&
    webSocketWind?.socketId === activeSocketId &&
    webSocketWindAge !== null &&
    webSocketWindAge <= WIND_LIVE_MS;
  const restWindIsFresh =
    isOnline && restWindAge !== null && restWindAge <= REST_FALLBACK_MS;

  let currentWind = null;
  let windState = "connecting";
  if (!isOnline) {
    currentWind = [webSocketWind, restWind]
      .filter(Boolean)
      .sort((left, right) => right.measuredAt - left.measuredAt)[0] || null;
    windState = currentWind ? "offline" : "unavailable";
  } else if (webSocketWindIsFresh) {
    currentWind = webSocketWind;
    windState = "live";
  } else if (restWindIsFresh) {
    currentWind = restWind;
    windState = "backup";
  } else {
    currentWind = [webSocketWind, restWind]
      .filter(Boolean)
      .sort((left, right) => right.measuredAt - left.measuredAt)[0] || null;
    windState = currentWind
      ? "stale"
      : socketState === "disconnected"
        ? "unavailable"
        : "connecting";
  }

  const currentWindAge = currentWind
    ? Math.max(0, statusClock - currentWind.measuredAt)
    : null;
  const windStatusDetail = {
    ageLabel: currentWindAge === null ? null : ageLabel(currentWindAge),
    ageMs: currentWindAge,
    hasSample: Boolean(currentWind),
    isCurrent: windState === "live" || windState === "backup",
    measuredAt: currentWind?.measuredAt || null,
    source: currentWind?.source || null,
    state: windState,
  };
  const windStatus = windState;
  const windSource = currentWind?.source || "none";
  const windUpdatedAt = currentWind?.measuredAt
    ? new Date(currentWind.measuredAt).toISOString()
    : null;
  const windAgeMs = currentWindAge;
  const windStatusText = formatWindStatusText(
    windStatus,
    windStatusDetail.ageLabel
  );
  const weatherAge =
    weatherMeasuredAt === null
      ? null
      : Math.max(0, statusClock - weatherMeasuredAt);
  const weatherStatus = {
    ageLabel: weatherAge === null ? null : ageLabel(weatherAge),
    ageMs: weatherAge,
    hasSample: weatherMeasuredAt !== null,
    isCurrent:
      isOnline &&
      weatherAge !== null &&
      weatherAge <= WEATHER_LIVE_MS,
    measuredAt: weatherMeasuredAt,
    state: !isOnline
      ? weatherMeasuredAt === null
        ? "unavailable"
        : "offline"
      : weatherMeasuredAt === null
        ? "loading"
        : weatherAge <= WEATHER_LIVE_MS
          ? "live"
          : "stale",
  };
  const historyStatus = {
    ageLabel: restWindAge === null ? null : ageLabel(restWindAge),
    ageMs: restWindAge,
    error: historyError,
    hasSample: Boolean(restWind),
    isCurrent: restWindIsFresh && historyError === null,
    lastSuccessAt: historyLastSuccessAt,
    measuredAt: restWind?.measuredAt || null,
    state: !isOnline
      ? restWind
        ? "offline"
        : "unavailable"
      : historyError
        ? "error"
        : restWindIsFresh
          ? "current"
          : restWind
            ? "stale"
            : "loading",
  };
  const gustHistoryStatus = historyStatus;

  const speed = currentWind?.speed ?? 0;
  const gustSpeed = currentWind?.gustSpeed ?? null;
  const direction = currentWind?.direction ?? 0;
  const variableDirection1 = currentWind?.variableDirection?.[0] || "";
  const variableDirection2 = currentWind?.variableDirection?.[1] || "";
  const isAwosLive = windStatus === "live";
  const canEvaluateWindSafety =
    windStatus === "live" && historyStatus.isCurrent;
  const validGustData = gustData[0]?.error ? [] : gustData;
  const historicalMaxGust = validGustData.length
    ? Math.max(...validGustData.map((gust) => gust.gust_speed))
    : 0;
  const historicalMaxSpeed = validGustData.length
    ? Math.max(...validGustData.map((gust) => gust.wind_speed))
    : 0;
  const maxGust =
    historicalMaxGust < gustSpeed ? gustSpeed : historicalMaxGust;
  const maxSpeed = historicalMaxSpeed < speed ? speed : historicalMaxSpeed;

  useEffect(() => {
    const timer = setInterval(
      () => setStatusClock(Date.now() + serverClockOffset.current),
      STATUS_TICK_MS
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const stopWind = startPolling({
      intervalMs: THIRTY_SECONDS,
      request: fetchWindHistory,
      onResult: ({ data, serverNow }) => {
        const clientNow = Date.now();
        const now = serverNow ?? clientNow;
        if (serverNow !== null) {
          serverClockOffset.current = serverNow - clientNow;
        }
        if (!Array.isArray(data) || data.length === 0) {
          setGustData((current) =>
            current.length ? current : [{ error: "no gust data found" }]
          );
          setHistoryError("No gust data found");
        } else {
          const normalizedData = data
            .map((row) => normalizeHistoryRow(row, now))
            .filter(Boolean)
            .sort((left, right) => left.measuredAt - right.measuredAt);
          const hasInvalidRows = normalizedData.length !== data.length;

          if (normalizedData.length === 0) {
            setGustData((current) =>
              current.length ? current : [{ error: "no valid gust data found" }]
            );
            setHistoryError("No valid gust data found");
            return;
          }

          const latest = normalizedData.at(-1);
          setGustData(normalizedData);
          setRestWind({
            direction: latest.direction,
            gustSpeed: latest.gust_speed || null,
            measuredAt: latest.measuredAt,
            source: "gust-history",
            speed: latest.wind_speed,
            variableDirection: null,
          });
          setHistoryError(
            hasInvalidRows ? "Wind history contained invalid rows" : null
          );
          setHistoryLastSuccessAt(now);
          setStatusClock(now);
        }
      },
      onError: () => setHistoryError("Wind history request failed"),
    });

    const stopAloft = startPolling({
      intervalMs: THREE_MINUTES,
      request: (options) => fetchJson("/api/weather/aloft", options),
      onResult: (data) => {
        const winds = data?.direction
          ? data
          : { error: data?.error || "no wind aloft info found!" };

        if (winds.error) {
          setDirections(winds);
          setTemps({});
          setSpeeds({});
          setReceived(null);
        } else {
          setDirections(winds.direction);
          setTemps(winds.temp);
          setSpeeds(winds.speed);
          setReceived(winds.validtime);
        }
      },
    });

    const stopJumprun = startPolling({
      intervalMs: THIRTY_SECONDS,
      request: (options) => fetchJson("/api/jumpruns/", options),
      onResult: (data) => {
        if (!Array.isArray(data?.jumpruns)) {
          if (data && typeof data === "object") {
            setJumpruns(data);
            setNewSpot("");
            setNewOffset("");
          }
          return;
        }

        setJumpruns(data.jumpruns);
        const latestJumprun = data.jumpruns[0];
        setNewSpot(formatJumprunAdjustment(latestJumprun?.spot));
        setNewOffset(formatJumprunAdjustment(latestJumprun?.offset));
      },
    });

    const stopAstronomy = startPolling({
      intervalMs: TEN_MINUTES,
      request: (options) => fetchJson("/api/weather/astronomy", options),
      onResult: (data) => {
        if (!data?.results) {
          return;
        }

        const options = {
          hour: "numeric",
          minute: "numeric",
          hour12: true,
          timeZone: "America/Chicago",
        };
        const options24 = {
          hour: "numeric",
          minute: "numeric",
          hour12: false,
          timeZone: "America/Chicago",
        };

        const sunsetFormat = new Date(data.results.sunset).toLocaleTimeString(
          "en-US",
          options
        );
        const sunriseFormat = new Date(data.results.sunrise).toLocaleTimeString(
          "en-US",
          options
        );
        const twilightFormat = new Date(
          data.results.civil_twilight_end
        ).toLocaleTimeString("en-US", options);

        const sunsetFormat24 = new Date(
          data.results.sunset
        ).toLocaleTimeString("en-US", options24);
        const sunriseFormat24 = new Date(
          data.results.sunrise
        ).toLocaleTimeString("en-US", options24);
        const twilightFormat24 = new Date(
          data.results.civil_twilight_end
        ).toLocaleTimeString("en-US", options24);

        setSunset(sunsetFormat);
        setSunrise(sunriseFormat);
        setTwilight(twilightFormat);
        setSunset24(sunsetFormat24);
        setSunrise24(sunriseFormat24);
        setTwilight24(twilightFormat24);
      },
    });

    const recoverPolling = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      void stopWind.runNow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        recoverPolling();
      }
    };

    window.addEventListener("focus", recoverPolling);
    window.addEventListener("online", recoverPolling);
    window.addEventListener("pageshow", recoverPolling);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", recoverPolling);
      window.removeEventListener("online", recoverPolling);
      window.removeEventListener("pageshow", recoverPolling);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopWind();
      stopAloft();
      stopJumprun();
      stopAstronomy();
    };
  }, []);

  useEffect(() => {
    const weatherQuery = `
        subscription {
          weather: weatherReported {
            receivedAt
            metar
            presentWeather
            temperature
            dewPoint
            visibility
            altimeterSetting
            densityAltitude
            skyCondition {
              cloudCover
              altitude
            }
          }
        }
        `;

    const windQuery = `
        subscription {
          wind: windReported {
            receivedAt
            speed
            gustSpeed
            direction
            variableDirection
          }
        }
        `;

    let disposed = false;
    let retryDelay = INITIAL_SOCKET_RETRY_MS;
    let retryTimer = null;
    let ackTimer = null;
    let dataTimer = null;
    let websocket = null;
    let online = typeof navigator === "undefined" || navigator.onLine !== false;
    let connect;
    const currentTime = () => Date.now() + serverClockOffset.current;

    const clearConnectionTimers = () => {
      if (ackTimer) {
        clearTimeout(ackTimer);
        ackTimer = null;
      }
      if (dataTimer) {
        clearTimeout(dataTimer);
        dataTimer = null;
      }
    };

    const detach = (target) => {
      target.onopen = null;
      target.onmessage = null;
      target.onerror = null;
      target.onclose = null;
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer || !online) {
        return;
      }

      const delay = retryDelay;
      const jitterFactor = 0.8 + Math.random() * 0.2;
      const scheduledDelay = Math.max(1, Math.floor(delay * jitterFactor));
      retryDelay = Math.min(retryDelay * 2, MAX_SOCKET_RETRY_MS);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, scheduledDelay);
    };

    const disconnect = (target, { reconnect = true } = {}) => {
      if (disposed || websocket !== target) {
        return;
      }

      websocket = null;
      setSocketState("disconnected");
      setStatusClock(currentTime());
      clearConnectionTimers();
      detach(target);
      if (
        target.readyState === WebSocket.CONNECTING ||
        target.readyState === WebSocket.OPEN
      ) {
        try {
          target.close();
        } catch {
          // Reconnection below still handles a browser close failure.
        }
      }
      if (reconnect) {
        scheduleReconnect();
      }
    };

    const armDataDeadline = (target, measuredAt = currentTime()) => {
      if (dataTimer) {
        clearTimeout(dataTimer);
      }
      const remainingFreshTime = Math.max(
        0,
        Math.min(WIND_LIVE_MS, measuredAt + WIND_LIVE_MS - currentTime())
      );
      dataTimer = setTimeout(() => disconnect(target), remainingFreshTime);
    };

    const sendSubscriptions = (target) => {
      target.send(
        JSON.stringify({
          type: "start",
          id: "weather",
          payload: { query: weatherQuery, variables: null },
        })
      );
      target.send(
        JSON.stringify({
          type: "start",
          id: "wind",
          payload: { query: windQuery, variables: null },
        })
      );
    };

    connect = () => {
      if (disposed || websocket || !online) {
        return;
      }

      setSocketState("connecting");
      let currentSocket;
      try {
        currentSocket = new WebSocket("wss://api.skydivecsc.com/graphql", [
          "graphql-ws",
        ]);
      } catch {
        setSocketState("disconnected");
        scheduleReconnect();
        return;
      }
      const socketId = socketSequence.current + 1;
      socketSequence.current = socketId;
      setActiveSocketId(socketId);
      websocket = currentSocket;
      let subscriptionsStarted = false;
      ackTimer = setTimeout(
        () => disconnect(currentSocket),
        SOCKET_ACK_TIMEOUT_MS
      );

      currentSocket.onopen = function () {
        if (disposed || websocket !== currentSocket) {
          return;
        }
        try {
          currentSocket.send(
            JSON.stringify({ type: "connection_init", payload: {} })
          );
        } catch {
          disconnect(currentSocket);
        }
      };

      currentSocket.onmessage = function (event) {
        if (disposed || websocket !== currentSocket) {
          return;
        }

        let res;
        try {
          res = JSON.parse(event.data);
        } catch {
          disconnect(currentSocket);
          return;
        }

        if (res?.type === "connection_ack") {
          if (subscriptionsStarted) {
            return;
          }
          subscriptionsStarted = true;
          clearTimeout(ackTimer);
          ackTimer = null;
          setSocketState("connected");
          armDataDeadline(currentSocket);
          try {
            sendSubscriptions(currentSocket);
          } catch {
            disconnect(currentSocket);
          }
          return;
        }
        if (res?.type === "ka") {
          return;
        }
        if (
          res?.type === "connection_error" ||
          res?.type === "error" ||
          res?.type === "complete"
        ) {
          disconnect(currentSocket);
          return;
        }

        if (res?.type !== "data" || !subscriptionsStarted) {
          disconnect(currentSocket);
          return;
        }

        if (res.payload?.errors) {
          disconnect(currentSocket);
          return;
        }

        if (res.id === "wind" && isWindReport(res.payload?.data?.wind)) {
          const wind = res.payload.data.wind;
          const measuredAt = parseReceivedAt(wind.receivedAt, currentTime());
          if (measuredAt === null) {
            disconnect(currentSocket);
            return;
          }
          if (
            latestWebSocketWindAt.current !== null &&
            measuredAt <= latestWebSocketWindAt.current
          ) {
            return;
          }

          latestWebSocketWindAt.current = measuredAt;
          setWebSocketWind({
            direction: wind.direction || 0,
            gustSpeed: wind.gustSpeed || null,
            measuredAt,
            socketId,
            source: "websocket",
            speed: wind.speed,
            variableDirection: wind.variableDirection,
          });
          setStatusClock(currentTime());
          armDataDeadline(currentSocket, measuredAt);
          retryDelay = INITIAL_SOCKET_RETRY_MS;
          return;
        }

        if (res.id === "wind") {
          disconnect(currentSocket);
          return;
        }

        if (
          res.id === "weather" &&
          isWeatherReport(res.payload?.data?.weather)
        ) {
          const weather = res.payload.data.weather;
          const measuredAt = parseReceivedAt(weather.receivedAt, currentTime());
          if (measuredAt === null) {
            disconnect(currentSocket);
            return;
          }
          if (
            latestWeatherAt.current !== null &&
            measuredAt <= latestWeatherAt.current
          ) {
            return;
          }
          latestWeatherAt.current = measuredAt;
          setWeatherMeasuredAt(measuredAt);
          setStatusClock(currentTime());

          setPressure(weather?.altimeterSetting || null);
          setDensityAlt(weather?.densityAltitude || null);
          setVisibility(weather?.visibility || null);
          setDewPoint(weather?.dewPoint || null);

          const metArr = weather.metar.split(" ");
          metArr.pop();
          metArr.pop();
          metArr.pop();
          metArr.shift();
          const formattedMetar = metArr.join(" ");
          setMetar(formattedMetar);

          setTemp(weather.temperature);
          setTempC(((weather.temperature - 32) / 1.8).toFixed(1));

          setCloudCeiling1(`${weather?.skyCondition[0]?.altitude}'`);
          setCloudCeilingM1(
            `${(weather?.skyCondition[0]?.altitude / 3.28).toFixed(0)}M`
          );

          if (weather.skyCondition[0].altitude === null) {
            setCloudCeiling1("");
            setCloudCeilingM1("");
          }

        setCloudCeiling2(`${weather?.skyCondition[1]?.altitude}'`);
        setCloudCeilingM2(
          `${(weather?.skyCondition[1]?.altitude / 3.28).toFixed(0)}M`
        );

        if (!weather.skyCondition[1]) {
          setCloudCeiling2("");
          setCloudCeilingM2("");
          setSkyCondition2("");
        }

        setCloudCeiling3(`${weather?.skyCondition[2]?.altitude}'`);
        setCloudCeilingM3(
          `${(weather?.skyCondition[2]?.altitude / 3.28).toFixed(0)}M`
        );

        if (!weather.skyCondition[2]) {
          setCloudCeiling3("");
          setCloudCeilingM3("");
          setSkyCondition3("");
        }

        if (!weather.presentWeather) {
          setMetarAbbr("");
          setMetarDesc("");
        }

        const metarDescriptors = {
          "-": "Light",
          "+": "Heavy",
          VC: "Vicinity",
          MI: "Shallow",
          PR: "Partial",
          BC: "Patches",
          DR: "Low Drifting",
          BL: "Blowing",
          FZ: "Freezing",
        };

        const metarAbbreviators = {
          BR: "Mist",
          TS: "Thunderstorms",
          SH: "Shower",
          DZ: "Drizzle",
          RA: "Rain",
          UP: "Precipitation",
          SN: "Snow",
          PO: "DUST DEVILS",
          SS: "Sand Storm",
          GR: "Hail",
          FG: "Fog",
          FU: "Smoke",
          HZ: "Haze",
          FC: "Tornado",
        };

        if (weather.presentWeather) {
          for (const condition of Object.keys(metarDescriptors)) {
            if (weather.presentWeather.includes(condition)) {
              setMetarDesc(metarDescriptors[condition]);
            }
          }

          for (const condition of Object.keys(metarAbbreviators)) {
            if (weather.presentWeather.includes(condition)) {
              setMetarAbbr(metarAbbreviators[condition]);
            }
          }
        }

        const skyConditions = {
          CLR: "Clear Sky",
          SCT: "Scattered",
          BKN: "Broken",
          OVC: "Overcast",
        };

        setSkyCondition1(
          skyConditions[weather?.skyCondition[0]?.cloudCover] || ""
        );
        setSkyCondition2(
          skyConditions[weather?.skyCondition[1]?.cloudCover] || ""
        );
        setSkyCondition3(
          skyConditions[weather?.skyCondition[2]?.cloudCover] || ""
        );

        if (
          (weather.skyCondition[0]?.cloudCover === "CLR" ||
            weather.skyCondition[0]?.altitude === null) &&
          (!weather.skyCondition[1] || !weather.skyCondition[1].cloudCover) &&
          (!weather.skyCondition[2] || !weather.skyCondition[2].cloudCover)
        ) {
          setSkyCondition1("Clear Sky");
          setCloudCeiling1("");
          setCloudCeilingM1("");
          setSkyCondition2("");
          setCloudCeiling2("");
          setCloudCeilingM2("");
          setSkyCondition3("");
          setCloudCeiling3("");
          setCloudCeilingM3("");
        }
          return;
        }

        if (res.id === "wind" || res.id === "weather") {
          disconnect(currentSocket);
        }
      };

      currentSocket.onerror = () => disconnect(currentSocket);
      currentSocket.onclose = () => disconnect(currentSocket);
    };

    const recoverConnection = () => {
      if (
        disposed ||
        !online ||
        (typeof document !== "undefined" &&
          document.visibilityState === "hidden")
      ) {
        return;
      }

      const latestWindAge =
        latestWebSocketWindAt.current === null
          ? null
          : currentTime() - latestWebSocketWindAt.current;
      if (
        websocket &&
        (websocket.readyState === WebSocket.CONNECTING ||
          (latestWindAge !== null && latestWindAge <= WIND_LIVE_MS))
      ) {
        return;
      }

      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (websocket) {
        disconnect(websocket, { reconnect: false });
      }
      connect();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        recoverConnection();
      }
    };
    const handleOffline = () => {
      online = false;
      setIsOnline(false);
      setStatusClock(currentTime());
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (websocket) {
        disconnect(websocket, { reconnect: false });
      } else {
        setSocketState("disconnected");
      }
    };
    const handleOnline = () => {
      online = true;
      setIsOnline(true);
      setStatusClock(currentTime());
      recoverConnection();
    };

    window.addEventListener("focus", recoverConnection);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pageshow", recoverConnection);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    connect();

    return () => {
      disposed = true;
      window.removeEventListener("focus", recoverConnection);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pageshow", recoverConnection);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      clearConnectionTimers();
      if (websocket) {
        const currentSocket = websocket;
        websocket = null;
        detach(currentSocket);
        if (
          currentSocket.readyState === WebSocket.CONNECTING ||
          currentSocket.readyState === WebSocket.OPEN
        ) {
          try {
            currentSocket.close();
          } catch {
            // All handlers are already detached during cleanup.
          }
        }
      }
    };
  }, []);

  return (
    <WeatherContext.Provider
      value={{
        jumpruns,
        newSpot,
        newOffset,
        speed,
        gustSpeed,
        direction,
        metar,
        temp,
        tempC,
        tempSetting,
        setTempSetting,
        skyCondition1,
        skyCondition2,
        skyCondition3,
        cloudCeiling1,
        cloudCeiling2,
        cloudCeiling3,
        cloudCeilingM1,
        cloudCeilingM2,
        cloudCeilingM3,
        metarAbbr,
        metarDesc,
        gustData,
        gustHistoryStatus,
        historyStatus,
        darkTheme,
        setDarkTheme,
        unitSetting,
        setUnitSetting,
        directions,
        speeds,
        temps,
        received,
        pressure,
        visibility,
        densityAlt,
        dewPoint,
        sunset,
        sunrise,
        twilight,
        sunset24,
        sunrise24,
        twilight24,
        maxGust,
        variableDirection1,
        variableDirection2,
        maxSpeed,
        webcamDirection,
        setWebcamDirection,
        speedUnit,
        setSpeedUnit,
        isAwosLive,
        canEvaluateWindSafety,
        windAgeMs,
        windSource,
        windStatus,
        windStatusDetail,
        windStatusText,
        windUpdatedAt,
        weatherStatus,
        timeFormat,
        setTimeFormat,
      }}
    >
      {children}
    </WeatherContext.Provider>
  );
};

export default WindSpeedProvider;
