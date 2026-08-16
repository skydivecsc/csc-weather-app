import { useEffect, useState } from "react";
import { LOGIN_BASE_URL } from "../config";
import { LoadContext } from "./LoadContextValue";

const LoadProvider = ({ children }) => {
    const [loads, setLoads] = useState([])
    const [displaySport, setDisplaySport] = useState(localStorage.getItem('displaySport') || 'true')
    const [displayStudent, setDisplayStudent] = useState(localStorage.getItem('displayStudent') || 'true')
    const [displayTandem, setDisplayTandem] = useState(localStorage.getItem('displayTandem') || 'true')

    const getLoads = async () => {
        const res = await fetch(`${LOGIN_BASE_URL}/api/loads/`)
        const data = await res.json()
        if (data.loads) {
            setLoads(data.loads)
        }
        else if (data.error) {
            setLoads(data.error)
        }
        else {
            setLoads({error: "Can't fetch loads :("})
        }
    }

    useEffect(() => {
        const initialLoadTimeout = setTimeout(getLoads, 0);

        const fiveSecondInterval = setInterval(() => {
            getLoads();
        }, 5000)

        return () => {
            clearTimeout(initialLoadTimeout)
            clearInterval(fiveSecondInterval)
        }
    }, [])


    return (
        <LoadContext.Provider value={{loads, displaySport, displayStudent, displayTandem, setDisplaySport, setDisplayStudent, setDisplayTandem}}>
            {children}
        </LoadContext.Provider>
    )
}

export default LoadProvider
