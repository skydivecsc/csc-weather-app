import { useLocation } from "react-router";
import { useContext } from "react";
import { WeatherContext } from "../../context/WeatherContextValue";
import live from "../../images/live.png";
import "./livestatus.css";

function LiveStatus() {
  const { pathname } = useLocation();
  const { windStatus, windStatusText } = useContext(WeatherContext);

  const alwaysLivePaths = ["/webcams", "/aircraft", "/radar", "/manifest"];
  const isAlwaysLive = alwaysLivePaths.includes(pathname);
  const liveStatusText = pathname === "/aloft"
    ? "FORECAST"
    : isAlwaysLive
      ? "LIVE"
      : windStatusText;
  const showLiveIcon = isAlwaysLive || windStatus === "live";

  return (
    <div className={`livecomponent live-${windStatus || "unavailable"}`}>
      <span>
        {liveStatusText}
      </span>
      {showLiveIcon ? <img src={live} alt="" /> : null}
    </div>
  );
}

export default LiveStatus;
