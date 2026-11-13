export type Festival = {
  date: string;
  occasion: string;
  id: string;
};

export const FESTIVALS: Festival[] = [
  { date: "2026-11-08", occasion: "Diwali", id: "diwali" },
  { date: "2026-12-25", occasion: "Christmas", id: "christmas" },
  { date: "2027-01-01", occasion: "New Year", id: "new-year-2027" },
  {
    date: "2027-01-14",
    occasion: "Sankranti / Pongal",
    id: "sankranti-pongal-2027",
  },
];
