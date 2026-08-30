import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { WeatherContext } from "../../context/WeatherContextValue";
import "./webcam.css";

const YARD_PLAYER_URL =
  "https://api.wetmet.net/widgets/stream/frame.php?uid=7795ed8bc355d24aee9b77b82884944a";
const YARD_PLAYER_STALE_AFTER_MS = 25 * 60 * 1000;

const webcamSources = {
  west: "https://webcam.skydivecsc.com/hangar_nw",
  east: "https://webcam.skydivecsc.com/hangar_ne",
  patio: "https://webcam.skydivecsc.com/courtyard",
  lz: "https://webcam.skydivecsc.com/main_landing_area",
};

function WebCam() {
  const { webcamDirection, setWebcamDirection, darkTheme } =
    useContext(WeatherContext);
  const [timestamp, setTimestamp] = useState(() => Date.now());
  const [yardRefreshToken, setYardRefreshToken] = useState(() => Date.now());
  const yardRefreshTokenRef = useRef(null);
  const yardLastRefreshAtRef = useRef(null);
  const webcamSource = webcamSources[webcamDirection];
  const yardPlayerUrl = `${YARD_PLAYER_URL}&cscwx_reload=${yardRefreshToken}`;

  const reloadYardCamera = useCallback(() => {
    const refreshedAt = Date.now();
    const refreshToken = Math.max(
      refreshedAt,
      (yardRefreshTokenRef.current ?? yardRefreshToken) + 1
    );

    yardRefreshTokenRef.current = refreshToken;
    yardLastRefreshAtRef.current = refreshedAt;
    setYardRefreshToken(refreshToken);
  }, [yardRefreshToken]);

  const reloadYardCameraIfStale = useCallback(() => {
    const frameAge =
      Date.now() - (yardLastRefreshAtRef.current ?? yardRefreshToken);

    if (frameAge < 0 || frameAge >= YARD_PLAYER_STALE_AFTER_MS) {
      reloadYardCamera();
    }
  }, [reloadYardCamera, yardRefreshToken]);

  const handleWebcamEast = () => {
    setTimestamp(Date.now());
    setWebcamDirection("east");
    localStorage.setItem("webcamDirection", "east");
  };
  const handleWebcamPatio = () => {
    setTimestamp(Date.now());
    setWebcamDirection("patio");
    localStorage.setItem("webcamDirection", "patio");
  };
  const handleWebcamLz = () => {
    setTimestamp(Date.now());
    setWebcamDirection("lz");
    localStorage.setItem("webcamDirection", "lz");
  };
  const handleWebcamYard = () => {
    if (webcamDirection !== "yard") {
      reloadYardCamera();
    }

    setWebcamDirection("yard");
    localStorage.setItem("webcamDirection", "yard");
  };

  useEffect(() => {
    if (!webcamSource) {
      return undefined;
    }

    const interval = setInterval(() => {
      setTimestamp(Date.now());
    }, 3000);

    return () => clearInterval(interval);
  }, [webcamSource]);

  useEffect(() => {
    if (webcamDirection !== "yard") {
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reloadYardCameraIfStale();
      }
    };

    window.addEventListener("online", reloadYardCameraIfStale);
    window.addEventListener("pageshow", reloadYardCameraIfStale);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", reloadYardCameraIfStale);
      window.removeEventListener("pageshow", reloadYardCameraIfStale);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reloadYardCameraIfStale, webcamDirection]);

  return (
    <div className="hangar-cam">
      <div className="hangar-cam-buttons">


        <button
          onClick={handleWebcamYard}
          className={
            webcamDirection === "yard" && darkTheme === "true"
              ? "hangar-button-active"
              : webcamDirection === "yard" && darkTheme === "false"
              ? "hangar-button-active-light"
              : "hangar-button"
          }
        >
          Yard
        </button>


        {<button
          onClick={handleWebcamEast}
          className={
            webcamDirection === "east" && darkTheme === "true"
              ? "hangar-button-active"
              : webcamDirection === "east" && darkTheme === "false"
              ? "hangar-button-active-light"
              : "hangar-button"
          }
        >
          Hangar
        </button>}



        <button
          onClick={handleWebcamPatio}
          className={
            webcamDirection === "patio" && darkTheme === "true"
              ? "hangar-button-active"
              : webcamDirection === "patio" && darkTheme === "false"
              ? "hangar-button-active-light"
              : "hangar-button"
          }
        >
          Patio
        </button>

        <button
          onClick={handleWebcamLz}
          className={
            webcamDirection === "lz" && darkTheme === "true"
              ? "hangar-button-active"
              : webcamDirection === "lz" && darkTheme === "false"
              ? "hangar-button-active-light"
              : "hangar-button"
          }
        >
          LZ
        </button>


      </div>
      {!webcamSource ? (
        <div className="yard-cam">
          <div className="yard-camera-frame">
            <iframe
              key={yardRefreshToken}
              title="CSC Yard webcam"
              src={yardPlayerUrl}
              allow="autoplay; fullscreen"
              allowFullScreen
              aria-describedby="yard-camera-help"
            />
          </div>
          <p id="yard-camera-help" className="yard-camera-help">
            If the video is blank or stopped, reload it or open the camera
            directly.
          </p>
          <div className="yard-camera-actions">
            <button type="button" onClick={reloadYardCamera}>
              Reload Yard camera
            </button>
            <a
              href={YARD_PLAYER_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Yard camera directly
            </a>
          </div>
        </div>
      ) : (
        <img
          src={`${webcamSource}?${timestamp}`}
          id="cam"
          alt="Camera feed not found, This is a problem with the source and not this app."
        />
      )}

    </div>
  );
}

export default WebCam;
