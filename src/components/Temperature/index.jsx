import { useContext } from "react"
import { WeatherContext } from "../../context/WeatherContextValue"
import './temp.css'


function CurrentTemp() {
    const { temp, tempC, tempSetting, setTempSetting } = useContext(WeatherContext)

    const handleClick = () => {
        if (tempSetting === 'true') {
            setTempSetting('false')
            localStorage.setItem('tempSetting', 'false')
        } else {
            setTempSetting('true')
            localStorage.setItem('tempSetting', 'true')
        }
    }

    return (
        <div className='temp-content'>
            {window.location.pathname !== '/loadingarea'
            ? <div onClick={handleClick}>{temp === null || temp === undefined ? 'Unknown' : tempSetting === 'true' ? `${temp}º F` : tempC === null || tempC === undefined ? 'Unknown' : `${tempC}º C`}</div>
            : <div>{temp === null || temp === undefined ? 'Unknown' : `${temp}º F`}</div>
            }
        </div>
    )
}

export default CurrentTemp;
