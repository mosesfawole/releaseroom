export type TicketStatus = "open" | "closed";

export type Ticket = {
  id: string;
  title: string;
  status: TicketStatus;
};

export function filterTickets(
  tickets: readonly Ticket[],
  status: TicketStatus,
): Ticket[] {
  return tickets.filter((ticket) => ticket.status === status);
}
