import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { WeatherContext } from "./context/WeatherContext";

vi.mock("./components/Footer", () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));
vi.mock("./components/FooterLoadingArea", () => ({
  default: () => <div data-testid="loading-footer">Loading footer</div>,
}));
vi.mock("./components/Header", () => ({
  default: () => <div data-testid="header">Header</div>,
}));
vi.mock("./components/Navigation", () => ({
  default: () => <div data-testid="navigation">Navigation</div>,
}));

vi.mock("./components/Wind", () => ({
  default: () => <div data-testid="wind">wind</div>,
}));
vi.mock("./components/Webcam", () => ({
  default: () => <div data-testid="webcam">webcam</div>,
}));
vi.mock("./components/Gusts", () => ({
  default: () => <div data-testid="gusts">gusts</div>,
}));
vi.mock("./components/Aloft", () => ({
  default: () => <div data-testid="aloft">aloft</div>,
}));
vi.mock("./components/Radar", () => ({
  default: () => <div data-testid="radar">radar</div>,
}));
vi.mock("./components/Detailed", () => ({
  default: () => <div data-testid="detailed">detailed</div>,
}));
vi.mock("./components/LoadingArea", () => ({
  default: () => <div data-testid="loading-area">loading-area</div>,
}));
vi.mock("./components/Me", () => ({
  default: () => <div data-testid="me">me</div>,
}));
vi.mock("./components/Aircraft", () => ({
  default: () => <div data-testid="aircraft">aircraft</div>,
}));
vi.mock("./components/WebcamHelp", () => ({
  default: () => <div data-testid="webcam-help">webcam-help</div>,
}));
vi.mock("./components/Safety", () => ({
  default: () => <div data-testid="safety">safety</div>,
}));
vi.mock("./components/Manifest", () => ({
  default: () => <div data-testid="manifest">manifest</div>,
}));

function renderRoute(path) {
  window.history.pushState({}, "", path);

  return render(
    <WeatherContext.Provider value={{ darkTheme: "true" }}>
      <App />
    </WeatherContext.Provider>
  );
}

describe("App routing", () => {
  it.each([
    ["/", "wind"],
    ["/webcams", "webcam"],
    ["/gusts", "gusts"],
    ["/aloft", "aloft"],
    ["/radar", "radar"],
    ["/aircraft", "aircraft"],
    ["/detailed", "detailed"],
    ["/me", "me"],
    ["/webcamhelp", "webcam-help"],
    ["/safety", "safety"],
    ["/manifest", "manifest"],
  ])("renders %s with the expected page", (path, testId) => {
    renderRoute(path);

    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("navigation")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("preserves the home-page fallback for an unknown path", () => {
    renderRoute("/not-a-real-page");

    expect(screen.getByTestId("wind")).toBeInTheDocument();
  });

  it("uses the loading-area layout without normal navigation or footer", () => {
    const { container } = renderRoute("/loadingarea");

    expect(screen.getByTestId("loading-area")).toBeInTheDocument();
    expect(screen.queryByTestId("navigation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("footer")).not.toBeInTheDocument();
    expect(screen.getByTestId("loading-footer")).toBeInTheDocument();
    expect(
      container.querySelector(".header-container-loadingarea")
    ).toBeInTheDocument();
  });
});
