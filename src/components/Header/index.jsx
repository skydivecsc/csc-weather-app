import GetCst from "../Time";
import CurrentTemp from "../Temperature";
import LiveStatus from "../LiveStatus";
import Beerlight from "../Beerlight";
import HamburgerMenu from "../HamburgerMenu";
import "./headermenu.css";

function Header() {

  return (
    <>
      {window.location.pathname !== "/loadingarea" ? <HamburgerMenu /> : null}

      <div className="livestatus">
        <LiveStatus />
      </div>
      <div className="time-container">
        <Beerlight />
        <GetCst />
        <Beerlight />
      </div>

      {window.location.pathname !== "/loadingarea" ? (
        <div className="header-imgs">
          {/* Audio feed removed while rebuilding; retain spacing. */}
        </div>
      ) : null}

      <div className="temp-container">
        <CurrentTemp />
      </div>
    </>
  );
}

export default Header;
