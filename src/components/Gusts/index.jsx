import 'chart.js/auto';
import { Line } from 'react-chartjs-2'
import 'chartjs-plugin-annotation';
import { useContext } from 'react';
import { WeatherContext } from '../../context/WeatherContextValue';
import LoadingDots from '../LoadingDots';
import './gusts.css'

function GustChart() {
    const { gustData, darkTheme, speedUnit, timeFormat } = useContext(WeatherContext)
    const options = {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        minute: '2-digit',
        hour12: timeFormat === 'true',
    };
    const useKnots = window.location.pathname === '/loadingarea' || speedUnit === 'true';
    const times = gustData.map(gust => {
        const timeObj = new Date(gust.received_time)
        return timeObj.toLocaleTimeString('en-US', options).split(' ')[0]
    })
    const speeds = gustData.map(wind =>
        useKnots ? wind.wind_speed : Math.round(wind.wind_speed * 1.151)
    )
    const gusts = gustData.map(wind =>
        useKnots ? wind.gust_speed : Math.round(wind.gust_speed * 1.151)
    )


    const data = {
        labels: times,

        datasets: [
            {
                label: 'Wind Speed',
                data: speeds,

                fill: true,
                backgroundColor: 'rgba(8, 228, 209, .8)', // Fill color
                borderColor: 'rgba(0,0,0,1)', // Line color
                pointBackgroundColor: 'rgb(8, 228, 209)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(75,192,192,1)',
                tension: 0.4
            },
            {
                label: 'Gust Speed',
                data: gusts,

                fill: true,
                backgroundColor: 'rgba(255,0,0,.7)', // Fill color
                borderColor: 'rgba(0,0,0,1)', // Line color
                pointBackgroundColor: 'rgba(255,0,0,1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(75,192,192,1)',
                tension: 0.4
            }
        ]
    }

    if (!gustData.length) {
        return <div className="loading">Live Gusts Loading<LoadingDots /></div>;
      }

    if (gustData[0].error) {
        return <div className="loading">No Gust Data Found</div>
    }

    return (
        <div className="gust-chart" id={window.location.pathname !== '/loadingarea' ? (darkTheme === 'true' ? 'gust-app' : 'gust-app-light') : null}>
            <Line
                className='chart'
                data={data}
                options={{
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            font: {
                                size: 16,
                                weight: 'bold',
                                color: 'rgba(0, 0, 0, .8)',
                            },
                            text: `Wind Speed in ${window.location.pathname === '/loadingarea' ? 'kts' : speedUnit === 'true' ? 'kts' : 'mph'} - Previous 30 Mins`,
                        },
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            min: 0,
                            max: 30,
                            ticks: {
                                color: darkTheme === 'true' ? 'rgb(8, 228, 209)' : 'rgb(0, 0, 0)',
                            },
                            grid: {
                                color: darkTheme === 'true' ? 'rgb(8, 228, 209)' : 'rgb(0, 0, 0)',
                            },
                        },
                        x: {
                            grid: {
                                color: `rgb(0, 0, 0)`,
                            }
                        }
                    }
                }}
            />
        </div>
    );
}

export default GustChart
