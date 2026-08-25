import { useContext } from 'react';
import { NavLink } from 'react-router';
import { WeatherContext } from '../../context/WeatherContextValue';
import './nav.css'

function NavBar() {
  const { darkTheme } = useContext(WeatherContext);
  const theme = darkTheme === 'false' ? 'light' : '';
  const navClassName = ({ isActive }) => {
    if (!isActive) {
      return 'navbutton';
    }

    return darkTheme === 'true' ? 'navbuttonactive' : 'navbuttonactivelight';
  };

  return (
    <div className={`nav-component ${theme}`}>


      <div className='nav-top-half'>
        <div>
          <NavLink end to="/" id="1" className={navClassName}>HOME</NavLink>
        </div>
        <div>
          <NavLink end to="/gusts" id="2" className={navClassName}>GUSTS</NavLink>
        </div>
        <div>
          <NavLink end to="/aloft" id="3" className={navClassName}>ALOFT</NavLink>
        </div>
        <div>
          <NavLink end to="/detailed" id="5" className={navClassName}>DETAILED</NavLink>
        </div>
      </div>


      <div className='nav-bottom-half'>
        <div>
          <NavLink end to="/webcams" id="4" className={navClassName}>WEBCAMS</NavLink>
        </div>
        <div>
          <NavLink end to="/aircraft" id="8" className={navClassName}>AIRCRAFT</NavLink>
        </div>
        <div>
          <NavLink end to="/radar" id="7" className={navClassName}>RADAR</NavLink>
        </div>
        <div>
          <NavLink end to="/manifest" id="9" className={navClassName}>MANIFEST</NavLink>
        </div>
      </div>

    </div>
  );
}

export default NavBar;
