export type ShortProperty = {
  title: string;
  locality: string;
  city: string;
  price: string;
};

/** Two short records only: title, locality, city, price. */
export function buildShortPropertyPrompt(
  message: string,
  properties: ShortProperty[],
) {
  const rows = properties.slice(0, 2).map((property) => ({
    title: property.title,
    locality: property.locality,
    city: property.city,
    price: property.price,
  }));

  return `You are Propenu AI.

User Query:
${String(message || "").slice(0, 500)}

Matching Properties:
${JSON.stringify(rows)}

Rules:
- Be concise
- Mention locality and city
- Mention prices
- Sound like property consultant
- Use only these records`;
}

export function buildPropertyPrompt(
  message: string,
  properties: any[]
) {

  return `
You are Propenu AI.

User Query:
${message}

Matching Properties:
${JSON.stringify(properties)}

Rules:
- Be concise
- Mention locality and city
- Mention prices
- Sound like property consultant
`;
}