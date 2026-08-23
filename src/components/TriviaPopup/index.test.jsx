import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TriviaPopup from ".";

describe("TriviaPopup", () => {
  it("links to the trivia site configured for the current environment", () => {
    render(<TriviaPopup />);

    const link = screen.getByRole("link", { name: "trivia.test.invalid" });
    expect(link).toHaveAttribute("href", "https://trivia.test.invalid");
  });

  it("remembers when the popup is dismissed", () => {
    const { container } = render(<TriviaPopup />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(localStorage.getItem("triviaPopup")).toBe("false");
    expect(container.firstChild).toHaveClass("trivia-hidden");
  });
});
