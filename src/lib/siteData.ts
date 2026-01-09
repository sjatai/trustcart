export type Location = {
  name: string;
  slug: string;
  address: string;
  city: string;
  region: string;
  phone: string;
  hours: string[];
};

export const DEMO_LOCATIONS: Location[] = [
  {
    name: "Reliable Nissan - Main",
    slug: "main",
    address: "3910 Lomas Blvd NE",
    city: "Albuquerque",
    region: "NM",
    phone: "(505) 000-0000",
    hours: ["Mon–Fri: 9am–7pm", "Sat: 9am–6pm", "Sun: Closed"],
  },
  {
    name: "Reliable Nissan - Service Center",
    slug: "service-center",
    address: "4401 Lomas Blvd NE",
    city: "Albuquerque",
    region: "NM",
    phone: "(505) 000-0001",
    hours: ["Mon–Fri: 7am–6pm", "Sat: 8am–4pm", "Sun: Closed"],
  },
];

export type InventoryItem = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  tag: "New" | "Used" | "Certified";
};

export const DEMO_INVENTORY: InventoryItem[] = [
  { id: "inv-1", year: 2025, make: "Nissan", model: "Rogue", trim: "SV", price: 32995, miles: 12, tag: "New" },
  { id: "inv-2", year: 2024, make: "Nissan", model: "Altima", trim: "SR", price: 27950, miles: 1400, tag: "Used" },
  { id: "inv-3", year: 2023, make: "Nissan", model: "Pathfinder", trim: "SL", price: 37990, miles: 18250, tag: "Certified" },
  { id: "inv-4", year: 2022, make: "Nissan", model: "Sentra", trim: "SV", price: 19990, miles: 21410, tag: "Used" },
  { id: "inv-5", year: 2025, make: "Nissan", model: "Frontier", trim: "PRO-4X", price: 42995, miles: 9, tag: "New" },
];

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readingMinutes: number;
  body: string[];
};

export const DEMO_BLOG: BlogPost[] = [
  {
    slug: "how-to-book-a-test-drive",
    title: "How to Book a Test Drive in Under 5 Minutes",
    excerpt: "A simple, no-pressure way to schedule a test drive — plus what to bring and what to expect.",
    date: "2026-01-06",
    readingMinutes: 4,
    body: [
      "Scheduling a test drive should be simple. At Reliable Nissan, you can call, submit a short form, or visit in person.",
      "To move fast, share the model/trim you're considering, your preferred day/time, and a phone number for confirmation.",
      "Bring your driver's license and plan for 15–25 minutes behind the wheel. We'll answer questions and keep it low-pressure.",
    ],
  },
  {
    slug: "bad-credit-financing-options",
    title: "Bad Credit Financing: What Options Exist (And What Helps Approval)",
    excerpt: "A practical overview of financing paths, common requirements, and steps that can improve approval odds.",
    date: "2026-01-05",
    readingMinutes: 6,
    body: [
      "Bad credit doesn't automatically mean no options. Lenders evaluate income stability, down payment, and overall debt-to-income.",
      "Helpful steps include bringing proof of income, a valid ID, and being ready to discuss your monthly payment range.",
      "If you want, we can review pre-approval options and recommend a path that fits your budget.",
    ],
  },
  {
    slug: "trade-in-value-basics",
    title: "Trade-In Value Basics: What Impacts Your Offer",
    excerpt: "Mileage, condition, market demand, and service history — here’s what matters most for trade-in value.",
    date: "2026-01-03",
    readingMinutes: 5,
    body: [
      "Trade-in value is typically driven by condition, mileage, reconditioning needs, and real-time market demand.",
      "If you have service records and a second key, bring them — small details can reduce reconditioning uncertainty.",
      "We can provide a quick in-person appraisal and explain the factors behind the number.",
    ],
  },
];

export type FAQ = { q: string; a: string };

export const DEMO_FAQ: FAQ[] = [
  { q: "Do you offer bad credit financing?", a: "Yes. We work with multiple lenders and can review options based on income and budget. Ask about pre-approval." },
  { q: "How do I book a test drive?", a: "Use the “Schedule Test Drive” CTA on this site or call the location you prefer. We’ll confirm quickly." },
  { q: "What’s the process for trade-ins?", a: "Bring your vehicle and a valid ID. We’ll appraise it and explain the factors behind the offer." },
  { q: "Do you have service specials?", a: "Service specials change regularly. Use the “View Service Specials” CTA and we’ll show current offers." },
  { q: "Can I service my vehicle without an appointment?", a: "Walk-ins may be available depending on capacity. Booking ahead is the fastest way to guarantee time." },
  { q: "Do you offer warranty options?", a: "We offer manufacturer and extended coverage options depending on the vehicle. Ask a specialist for details." },
];


