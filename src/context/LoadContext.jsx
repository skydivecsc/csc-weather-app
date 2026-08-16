import { useEffect, useState } from "react";
import { LOGIN_BASE_URL } from "../config";
import { LoadContext } from "./LoadContextValue";
import { startPolling } from "./polling";

const LOAD_REFRESH_MS = 5000;
const LOAD_TIMEOUT_MS = 35000;

const fetchLoads = async ({ signal }) => {
  const response = await fetch(`${LOGIN_BASE_URL}/api/loads/`, { signal });
  const data = await response.json();
  if (typeof data?.error === "string") {
    return { error: data.error };
  }
  if (!response.ok) {
    throw new Error(`Load request failed with status ${response.status}`);
  }
  if (Array.isArray(data?.loads)) {
    return data.loads;
  }

  return { error: "Can't fetch loads :(" };
};

const LoadProvider = ({ children }) => {
  const [loads, setLoads] = useState([]);
  const [displaySport, setDisplaySport] = useState(
    localStorage.getItem("displaySport") || "true"
  );
  const [displayStudent, setDisplayStudent] = useState(
    localStorage.getItem("displayStudent") || "true"
  );
  const [displayTandem, setDisplayTandem] = useState(
    localStorage.getItem("displayTandem") || "true"
  );

  useEffect(() => {
    return startPolling({
      intervalMs: LOAD_REFRESH_MS,
      timeoutMs: LOAD_TIMEOUT_MS,
      request: fetchLoads,
      onResult: setLoads,
    });
  }, []);

  return (
    <LoadContext.Provider
      value={{
        loads,
        displaySport,
        displayStudent,
        displayTandem,
        setDisplaySport,
        setDisplayStudent,
        setDisplayTandem,
      }}
    >
      {children}
    </LoadContext.Provider>
  );
};

export default LoadProvider
