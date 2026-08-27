import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherContext } from "../../context/WeatherContextValue";
import Footer from ".";

describe("Footer attribution", () => {
  it("links Ryan Erickson's credit to his LinkedIn profile", () => {
    render(
      <WeatherContext.Provider
        value={{ jumpruns: [], metar: "", newOffset: "", newSpot: "" }}
      >
        <Footer />
      </WeatherContext.Provider>
    );

    expect(
      screen.getByRole("link", { name: "Created by: Ryan Erickson" })
    ).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/ryan-erickson-dev"
    );
    expect(
      screen.getByRole("link", { name: "Created by: Ryan Erickson" })
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "Created by: Ryan Erickson" })
    ).toHaveAttribute("rel", "noreferrer");
  });
});
