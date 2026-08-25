import { useLocation } from "react-router";
import { useContext } from "react";
import { WeatherContext } from "../../context/WeatherContextValue";
import live from "../../images/live.png";
import "./livestatus.css";

function LiveStatus() {
  const { pathname } = useLocation();
  const { isAwosLive } = useContext(WeatherContext);

  const alwaysLivePaths = ["/webcams", "/aircraft", "/radar", "/manifest"];
  const liveStatusText =
    pathname === "/aloft"
      ? "FORECAST"
      : alwaysLivePaths.includes(pathname) || isAwosLive
      ? "LIVE"
      : "AWOS DOWN";

  return (
    <div className="livecomponent">
      {liveStatusText} {liveStatusText === "LIVE" ? <img src={live} /> : null}
    </div>
  );
}

export default LiveStatus;
