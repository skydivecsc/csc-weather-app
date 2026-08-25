import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import NavBar from ".";

function renderNavigation(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <WeatherContext.Provider value={{ darkTheme: "true" }}>
        <NavBar />
      </WeatherContext.Provider>
    </MemoryRouter>
  );
}

describe("Navigation exact matching", () => {
  it("marks a navigation link current at its exact path", () => {
    renderNavigation("/gusts");

    expect(screen.getByRole("link", { name: "GUSTS" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("does not keep a navigation link current on a nested path", () => {
    renderNavigation("/gusts/not-a-real-page");

    expect(screen.getByRole("link", { name: "GUSTS" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
