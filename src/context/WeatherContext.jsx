import { useEffect, useState } from "react";
import { LOGIN_BASE_URL } from "../config";
import { startPolling } from "./polling";
import { WeatherContext } from "./WeatherContextValue";

const THIRTY_SECONDS = 30000;
const THREE_MINUTES = 180000;
const TEN_MINUTES = 600000;
const INITIAL_SOCKET_RETRY_MS = 1000;
const MAX_SOCKET_RETRY_MS = 30000;
const SOCKET_ACK_TIMEOUT_MS = 10000;
const SOCKET_DATA_TIMEOUT_MS = 15000;

const fetchJson = async (path, { signal }) => {
  const response = await fetch(`${LOGIN_BASE_URL}${path}`, { signal });
  if (!response.ok) {
    throw new Error(`${path} request failed with status ${response.status}`);
  }

  return response.json();
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

const isWindReport = (wind) =>
  wind &&
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
  typeof weather.metar === "string" &&
  Number.isFinite(weather.temperature) &&
  (weather.presentWeather === null ||
    typeof weather.presentWeather === "string") &&
  Array.isArray(weather.skyCondition) &&
  weather.skyCondition.length > 0 &&
  weather.skyCondition.slice(0, 3).every(isSkyCondition);

const WindSpeedProvider = ({ children }) => {
  const [speed, setSpeed] = useState(0);
  const [gustSpeed, setGustSpeed] = useState(null);
  const [direction, setDirection] = useState(0);
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
  const [isAwosLive, setIsAwosLive] = useState(false);
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
  const [variableDirection1, setVariableDirection1] = useState("");
  const [variableDirection2, setVariableDirection2] = useState("");
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

  const historicalMaxGust = gustData[0]?.error
    ? 0
    : Math.max(...gustData.map((gust) => gust.gust_speed));
  const historicalMaxSpeed = gustData[0]?.error
    ? 0
    : Math.max(...gustData.map((gust) => gust.wind_speed));
  const maxGust =
    historicalMaxGust < gustSpeed ? gustSpeed : historicalMaxGust;
  const maxSpeed = historicalMaxSpeed < speed ? speed : historicalMaxSpeed;

  useEffect(() => {
    const stopWind = startPolling({
      intervalMs: THIRTY_SECONDS,
      request: (options) => fetchJson("/api/weather/gusts", options),
      onResult: (data) => {
        if (!Array.isArray(data) || data.length === 0) {
          setGustData([{ error: "no gust data found" }]);
        } else {
          setGustData([...data]);
        }
      },
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

    return () => {
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
    let connect;

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
      if (disposed || retryTimer) {
        return;
      }

      const delay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, MAX_SOCKET_RETRY_MS);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    };

    const disconnect = (target) => {
      if (disposed || websocket !== target) {
        return;
      }

      websocket = null;
      setIsAwosLive(false);
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
      scheduleReconnect();
    };

    const armDataDeadline = (target) => {
      if (dataTimer) {
        clearTimeout(dataTimer);
      }
      dataTimer = setTimeout(
        () => disconnect(target),
        SOCKET_DATA_TIMEOUT_MS
      );
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
      if (disposed || websocket) {
        return;
      }

      let currentSocket;
      try {
        currentSocket = new WebSocket("wss://api.skydivecsc.com/graphql", [
          "graphql-ws",
        ]);
      } catch {
        setIsAwosLive(false);
        scheduleReconnect();
        return;
      }
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

          setVariableDirection1(wind?.variableDirection?.[0] || "");
          setVariableDirection2(wind?.variableDirection?.[1] || "");
          setSpeed(wind.speed);
          setGustSpeed(wind?.gustSpeed || null);
          setDirection(wind?.direction || 0);
          armDataDeadline(currentSocket);
          setIsAwosLive(true);
          retryDelay = INITIAL_SOCKET_RETRY_MS;
          return;
        }

        if (
          res.id === "weather" &&
          isWeatherReport(res.payload?.data?.weather)
        ) {
          const weather = res.payload.data.weather;

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
          armDataDeadline(currentSocket);
          setIsAwosLive(true);
          retryDelay = INITIAL_SOCKET_RETRY_MS;
          return;
        }

        if (res.id === "wind" || res.id === "weather") {
          disconnect(currentSocket);
        }
      };

      currentSocket.onerror = () => disconnect(currentSocket);
      currentSocket.onclose = () => disconnect(currentSocket);
    };

    connect();

    return () => {
      disposed = true;
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
        timeFormat,
        setTimeFormat,
      }}
    >
      {children}
    </WeatherContext.Provider>
  );
};

export default WindSpeedProvider;
