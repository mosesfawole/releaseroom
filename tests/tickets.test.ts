import { describe, expect, it } from "vitest";

import { filterTickets, type Ticket } from "../src/tickets.js";

const tickets: Ticket[] = [
  { id: "T-1", title: "Login loop", status: "open" },
  { id: "T-2", title: "Receipt typo", status: "closed" },
];

describe("filterTickets", () => {
  it("returns only tickets whose status exactly matches the requested status", () => {
    expect(filterTickets(tickets, "open").map((ticket) => ticket.id)).toEqual(["T-1"]);
  });
});
