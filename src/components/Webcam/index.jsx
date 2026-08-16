import { useEffect, useContext, useState } from "react";
import { WeatherContext } from "../../context/WeatherContextValue";
import "./webcam.css";

const webcamSources = {
  west: "https://webcam.skydivecsc.com/hangar_nw",
  east: "https://webcam.skydivecsc.com/hangar_ne",
  patio: "https://webcam.skydivecsc.com/courtyard",
  lz: "https://webcam.skydivecsc.com/main_landing_area",
};

function WebCam() {
  const { webcamDirection, setWebcamDirection, darkTheme } =
    useContext(WeatherContext);
  const [timestamp, setTimestamp] = useState(Date.now);
  const webcamSource = webcamSources[webcamDirection];

  const handleWebcamEast = () => {
    setWebcamDirection("east");
    localStorage.setItem("webcamDirection", "east");
  };
  const handleWebcamPatio = () => {
    setWebcamDirection("patio");
    localStorage.setItem("webcamDirection", "patio");
  };
  const handleWebcamLz = () => {
    setWebcamDirection("lz");
    localStorage.setItem("webcamDirection", "lz");
  };
  const handleWebcamYard = () => {
    setWebcamDirection("yard");
    localStorage.setItem("webcamDirection", "yard");
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setTimestamp(Date.now());
    }, 3000);

    return () => clearInterval(interval);
  }, []);

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
          <iframe
            title="csc-yard-webcam"
            src="https://api.wetmet.net/widgets/stream/frame.php?uid=7795ed8bc355d24aee9b77b82884944a"
            scrolling="no"
          />
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
