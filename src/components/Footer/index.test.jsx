import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import Footer from ".";

describe("Footer attribution", () => {
  it("renders Ryan Erickson's credit as plain text", () => {
    render(
      <WeatherContext.Provider
        value={{ jumpruns: [], metar: "", newOffset: "", newSpot: "" }}
      >
        <Footer />
      </WeatherContext.Provider>
    );

    expect(screen.getByText("Created by: Ryan Erickson")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Created by: Ryan Erickson" })
    ).not.toBeInTheDocument();
  });
});
