import { Route, Routes, useLocation } from "react-router";
import { WeatherContext } from "./context/WeatherContextValue";
import { useContext } from "react";
import Footer from "./components/Footer";
import FooterLoadingArea from "./components/FooterLoadingArea";
import Header from "./components/Header";
import Wind from "./components/Wind";
import WebCam from "./components/Webcam";
import GustChart from "./components/Gusts";
import NavBar from "./components/Navigation";
import WindsAloft from "./components/Aloft";
import CscRadar from "./components/Radar";
import DetailedPage from "./components/Detailed";
import LoadingArea from "./components/LoadingArea";
import Me from "./components/Me";
import Aircraft from "./components/Aircraft";
import WebcamHelp from "./components/WebcamHelp";
import Safety from "./components/Safety";
import Manifest from "./components/Manifest";
import UpdateDetector from "./components/UpdateDetector";
import "./App.css";

function App() {
  const { darkTheme } = useContext(WeatherContext);
  const { pathname } = useLocation();
  const isLoadingArea = pathname === "/loadingarea";

  return (
    <div className={darkTheme === "true" ? "App" : "Applight"}>
      <UpdateDetector isKiosk={isLoadingArea} />

      <div
        className={
          isLoadingArea ? "header-container-loadingarea" : "header-container"
        }
      >
        <Header />
      </div>

      {!isLoadingArea && (
        <div className="nav-container">
          <NavBar />
        </div>
      )}

      <Routes>
        <Route
          path="/loadingarea"
          element={
            <div className="loadingarea-container">
              <LoadingArea />
            </div>
          }
        />
        <Route
          path="/webcams"
          element={
            <div className="hangar-cam-container">
              <WebCam />
            </div>
          }
        />
        <Route
          path="/gusts"
          element={
            <div className="gusts-container">
              <GustChart />
            </div>
          }
        />
        <Route
          path="/aloft"
          element={
            <div className="aloft-container">
              <WindsAloft />
            </div>
          }
        />
        <Route
          path="/radar"
          element={
            <div className="radar-container">
              <CscRadar />
            </div>
          }
        />
        <Route
          path="/aircraft"
          element={
            <div className="radar-container">
              <Aircraft />
            </div>
          }
        />
        <Route
          path="/detailed"
          element={
            <div className="detailed-container">
              <DetailedPage />
            </div>
          }
        />
        <Route
          path="/me"
          element={
            <div className="my-container">
              <Me />
            </div>
          }
        />
        <Route
          path="/webcamhelp"
          element={
            <div className="chart-container">
              <WebcamHelp />
            </div>
          }
        />
        <Route
          path="/safety"
          element={
            <div className="chart-container">
              <Safety />
            </div>
          }
        />
        <Route
          path="/manifest"
          element={
            <div className="manifest-container">
              <Manifest />
            </div>
          }
        />
        <Route
          path="/"
          element={
            <div className="chart-container">
              <Wind />
            </div>
          }
        />
        <Route
          path="*"
          element={
            <div className="chart-container">
              <Wind />
            </div>
          }
        />
      </Routes>

      <div className="footer-container">
        {isLoadingArea ? <FooterLoadingArea /> : <Footer />}
      </div>
    </div>
  );
}

export default App;
