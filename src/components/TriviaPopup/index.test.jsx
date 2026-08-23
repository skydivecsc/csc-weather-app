import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TriviaPopup from ".";

describe("TriviaPopup", () => {
  it("links the staging site to the staging trivia game", () => {
    render(<TriviaPopup />);

    const link = screen.getByRole("link", { name: "trivia.cscwx2.com" });
    expect(link).toHaveAttribute("href", "https://trivia.cscwx2.com");
  });

  it("remembers when the popup is dismissed", () => {
    const { container } = render(<TriviaPopup />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(localStorage.getItem("triviaPopup")).toBe("false");
    expect(container.firstChild).toHaveClass("trivia-hidden");
  });
});
